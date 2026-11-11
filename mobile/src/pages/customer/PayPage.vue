<script setup lang="ts">
/**
 * Payment screen. In this MVP the gateway is simulated ("test mode"): the buttons below stand in for the
 * gateway's result and go through the same server path a real gateway webhook would. No real money moves.
 */
import { IonContent, IonPage, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { OrderView, PaymentIntent } from '../../api/types';
import ShopSign from '../../components/ShopSign.vue';
import { money, plural } from '../../lib/format';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';
import { useCheckout } from '../../stores/checkout';
import { useAppConfig as useCfg } from '../../stores/appConfig';
const naira = (v: number) => money(v, useCfg().currency);

const route = useRoute();
const router = useRouter();
const checkout = useCheckout();
const cfg = useAppConfig();

const order = ref<OrderView | null>(null);
const intent = ref<PaymentIntent | null>(null);
const loading = ref(true);
const busy = ref<'pay' | 'fail' | 'cancel' | null>(null);
const failed = ref(false);
const loadError = ref('');

const orderId = computed(() => route.params.id as string);

async function load() {
  loading.value = true;
  loadError.value = '';
  failed.value = false;
  try {
    order.value = await api.order(orderId.value);
    if (order.value.status !== 'PENDING_PAYMENT') {
      await router.replace(`/c/order/${orderId.value}`); // already paid or closed
      return;
    }
    intent.value = checkout.take(orderId.value) ?? (await api.retryPayment(orderId.value));
    checkout.set(orderId.value, intent.value);
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);

async function pay() {
  if (!intent.value) return;
  busy.value = 'pay';
  try {
    await api.simulatePayment(intent.value.reference, 'success');
    checkout.drop(orderId.value);
    success();
    toast('Payment received. The shop has your order.');
    await router.replace(`/c/order/${orderId.value}`);
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = null;
  }
}

async function simulateFailure() {
  if (!intent.value) return;
  busy.value = 'fail';
  try {
    await api.simulatePayment(intent.value.reference, 'failed');
    failed.value = true;
    // The failed attempt is closed on the server; open a fresh one so the person can try again.
    intent.value = await api.retryPayment(orderId.value);
    checkout.set(orderId.value, intent.value);
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = null;
  }
}

async function cancel() {
  const ok = await confirmAction({
    title: 'Cancel this order?',
    message: 'The items go back on the shelf and you will not be charged.',
    confirm: 'Cancel order',
    cancel: 'Keep order',
    destructive: true,
  });
  if (!ok) return;
  busy.value = 'cancel';
  try {
    await api.cancelOrder(orderId.value, 'Cancelled before payment');
    checkout.drop(orderId.value);
    toast('Order cancelled.');
    await router.replace('/c/orders');
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <div v-if="loading" class="skeleton" style="height: 200px; margin-top: 24px" role="status" aria-label="Loading"></div>

        <div v-else-if="loadError" class="notice bad" role="alert" style="margin-top: 24px">
          {{ loadError }}
          <button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="order && intent">
          <h1 class="title">Pay for your order</h1>
          <div class="row" style="margin-top: 6px">
            <ShopSign :name="order.shop.name" :color="order.shop.color" :size="36" />
            <div class="grow">
              <div class="strong">{{ order.shop.name }}</div>
              <div class="small muted">{{ plural(order.itemCount, 'item') }} · waybill {{ order.waybillNo }}</div>
            </div>
          </div>

          <section class="due" aria-label="Amount to pay">
            <div class="small muted">Amount to pay</div>
            <div class="money amount">{{ naira(intent.amount) }}</div>
            <div class="xsmall muted">Pay within {{ cfg.config.pendingPaymentTtlMin }} minutes or the order is released.</div>
          </section>

          <div v-if="cfg.config.paymentProvider === 'mock'" class="notice warn">
            <span class="strong">Test mode.</span> No real money moves. The buttons below act as the payment gateway so you can show both results.
          </div>
          <div v-if="failed" class="notice bad" role="alert" style="margin-top: 12px">
            The payment did not go through and you were not charged. Try again.
          </div>

          <div class="stack" style="margin-top: 24px; --stack: 10px">
            <button class="btn btn-primary block" :disabled="busy !== null" @click="pay">
              {{ busy === 'pay' ? 'Paying…' : `Pay ${naira(intent.amount)}` }}
            </button>
            <button v-if="cfg.config.paymentProvider === 'mock'" class="btn btn-line block" :disabled="busy !== null" @click="simulateFailure">
              {{ busy === 'fail' ? 'Working…' : 'Simulate a failed payment' }}
            </button>
            <button class="btn btn-text block" :disabled="busy !== null" @click="cancel">Cancel order</button>
          </div>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.due {
  margin: 28px 0 20px;
  padding: 20px;
  border-radius: 18px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.amount {
  font-size: 2.75rem;
  line-height: 1.1;
  margin: 4px 0 8px;
  letter-spacing: -0.03em;
}
</style>
