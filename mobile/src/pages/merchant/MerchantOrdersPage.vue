<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView, Shop } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import PinSheet from '../../components/PinSheet.vue';
import { clock, minutesUntil, naira, plural, when } from '../../lib/format';
import { FULFILMENT_LABEL } from '../../lib/status';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const badges = useBadges();

const orders = ref<OrderView[]>([]);
const shop = ref<Shop | null>(null);
const loading = ref(true);
const error = ref('');
const tab = ref<'new' | 'active' | 'done'>('new');
const busyId = ref<string | null>(null);
const prep = reactive<Record<string, number>>({});
const PREP_CHOICES = [10, 15, 20, 30, 45];

async function load() {
  error.value = '';
  try {
    const [o, s] = await Promise.all([api.merchant.orders(), api.merchant.shop()]);
    orders.value = o;
    shop.value = s;
    badges.merchantNew = o.filter((x) => x.status === 'PLACED').length;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['order.updated'], load);

async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const groups = computed(() => ({
  new: orders.value.filter((o) => o.status === 'PLACED'),
  active: orders.value.filter((o) => ['CONFIRMED', 'READY', 'ON_THE_WAY'].includes(o.status)).sort((a, b) => a.timeline.createdAt.localeCompare(b.timeline.createdAt)),
  done: orders.value.filter((o) => ['DELIVERED', 'CANCELLED'].includes(o.status)),
}));
const shown = computed(() => groups.value[tab.value]);

async function toggleOpen(open: boolean) {
  try {
    shop.value = await api.merchant.updateShop({ isOpen: open });
    toast(open ? 'You are open for orders.' : 'You are closed. No new orders will come in.');
  } catch (e) {
    await showError(e);
    load();
  }
}

/** Runs an order action with one busy flag, a consistent error path, and a refresh. */
async function act(o: OrderView, fn: () => Promise<OrderView>, done?: string) {
  busyId.value = o.id;
  try {
    const updated = await fn();
    orders.value = orders.value.map((x) => (x.id === updated.id ? updated : x));
    badges.merchantNew = orders.value.filter((x) => x.status === 'PLACED').length;
    if (done) toast(done);
  } catch (e) {
    await showError(e);
    load();
  } finally {
    busyId.value = null;
  }
}

const accept = (o: OrderView) =>
  act(o, () => api.merchant.accept(o.id, prep[o.id] ?? shop.value?.prepMinutes), 'Order accepted. The customer can see your timing.').then(() => (tab.value = 'active'));

async function decline(o: OrderView) {
  const ok = await confirmAction({
    title: o.status === 'PLACED' ? 'Decline this order?' : 'Cancel this order?',
    message: 'The customer is refunded in full and the items go back into your stock.',
    confirm: o.status === 'PLACED' ? 'Decline order' : 'Cancel order',
    cancel: 'Keep order',
    destructive: true,
  });
  if (ok) act(o, () => api.merchant.cancel(o.id, o.status === 'PLACED' ? 'The shop declined this order' : 'The shop could not fulfil this order'), 'Order cancelled and refunded.');
}

// ---- PIN handover --------------------------------------------------------------------------------
const pinOrder = ref<OrderView | null>(null);
const pinBusy = ref(false);
const pinError = ref('');

function openPin(o: OrderView) {
  pinError.value = '';
  pinOrder.value = o;
}
async function submitPin(pin: string) {
  const o = pinOrder.value;
  if (!o) return;
  pinBusy.value = true;
  pinError.value = '';
  try {
    const updated = await api.merchant.complete(o.id, pin);
    orders.value = orders.value.map((x) => (x.id === updated.id ? updated : x));
    pinOrder.value = null;
    success();
    toast(o.fulfilment === 'PICKUP' ? 'Handed over. Payment is yours.' : 'Delivered. Payment is yours.');
  } catch (e) {
    pinError.value = errorMessage(e);
  } finally {
    pinBusy.value = false;
  }
}

const itemsText = (o: OrderView) => o.items.map((i) => `${i.qty} × ${i.name}`);
const readyIn = (o: OrderView) => minutesUntil(o.estimatedReadyAt);
const BAR: Record<string, string> = { PLACED: 'var(--signal)', CONFIRMED: 'var(--ink)', READY: 'var(--good)', ON_THE_WAY: 'var(--ink-soft)', DELIVERED: 'var(--line)', CANCELLED: 'var(--bad)' };
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Orders</h1>
        <p v-if="shop" class="lede">{{ shop.name }}</p>

        <label v-if="shop" class="open row between">
          <span>
            <span class="strong block">{{ shop.isOpen ? 'Taking orders' : 'Closed to new orders' }}</span>
            <span class="small muted">{{ shop.isOpen ? 'Customers can order from you now.' : 'Switch on when you are ready.' }}</span>
          </span>
          <ion-toggle :checked="shop.isOpen" aria-label="Taking orders" @ionChange="toggleOpen($event.detail.checked)" />
        </label>

        <div class="texttabs" role="tablist" aria-label="Order status" style="margin-top: 8px">
          <button class="texttab" role="tab" :aria-selected="tab === 'new'" @click="tab = 'new'">New<span v-if="groups.new.length" class="count">{{ groups.new.length }}</span></button>
          <button class="texttab" role="tab" :aria-selected="tab === 'active'" @click="tab = 'active'">In progress<span v-if="groups.active.length" class="count">{{ groups.active.length }}</span></button>
          <button class="texttab" role="tab" :aria-selected="tab === 'done'" @click="tab = 'done'">Done</button>
        </div>

        <ListSkeleton v-if="loading" :rows="3" :sign="false" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState
          v-else-if="shown.length === 0"
          :title="tab === 'new' ? 'No new orders' : tab === 'active' ? 'Nothing in progress' : 'No finished orders yet'"
          :text="tab === 'new' ? 'New orders appear here the moment a customer pays.' : tab === 'active' ? 'Orders you accept show up here until they are handed over.' : 'Delivered and cancelled orders are listed here.'"
        />

        <ul v-else class="orders">
          <li v-for="o in shown" :key="o.id" class="order" :style="{ '--bar': BAR[o.status] }">
            <div class="row between">
              <span class="strong num">{{ o.waybillNo }}</span>
              <span class="small muted">{{ when(o.timeline.paidAt ?? o.timeline.createdAt) }}</span>
            </div>
            <div class="small muted" style="margin-top: 2px">
              {{ o.customer?.name }} · {{ FULFILMENT_LABEL[o.fulfilment] }} · {{ plural(o.itemCount, 'item') }}
            </div>

            <ul class="items">
              <li v-for="t in itemsText(o)" :key="t">{{ t }}</li>
            </ul>

            <div class="row between">
              <span class="small muted">{{ o.status === 'CANCELLED' ? 'Cancelled' : 'You earn' }}</span>
              <span class="money">{{ o.status === 'CANCELLED' ? '–' : naira(o.money.yourEarnings) }}</span>
            </div>
            <div class="xsmall muted">
              Sales {{ naira(o.money.itemSales) }} less {{ naira(o.money.commission) }} ORBIT commission<template v-if="o.fulfilment === 'MERCHANT_DELIVERY'"> plus your {{ naira(o.deliveryFee) }} delivery fee</template>
            </div>

            <div v-if="o.fulfilment === 'MERCHANT_DELIVERY' && o.deliveryAddress && o.status !== 'CANCELLED' && o.status !== 'DELIVERED'" class="notice" style="margin-top: 12px">
              <span class="strong">Deliver to:</span> {{ o.deliveryAddress }}<template v-if="o.deliveryNote"> · {{ o.deliveryNote }}</template>
            </div>
            <a v-if="o.customer?.phone && ['CONFIRMED', 'READY', 'ON_THE_WAY'].includes(o.status)" class="call small strong" :href="`tel:${o.customer.phone}`">Call {{ o.customer.name }}: {{ o.customer.phone }}</a>

            <!-- Actions depend on the status and on who is fulfilling -->
            <div v-if="o.status === 'PLACED'" class="actions">
              <div class="field" style="margin-bottom: 4px">
                <span class="small strong">Ready in</span>
                <div class="chips" style="margin-top: 8px" role="group" aria-label="Preparation time">
                  <button v-for="m in PREP_CHOICES" :key="m" class="chip" :aria-pressed="(prep[o.id] ?? shop?.prepMinutes) === m" @click="prep[o.id] = m">{{ m }} min</button>
                </div>
              </div>
              <button class="btn btn-primary block" :disabled="busyId === o.id" @click="accept(o)">Accept order</button>
              <button class="btn btn-text block" :disabled="busyId === o.id" @click="decline(o)">Decline order</button>
            </div>

            <div v-else-if="o.status === 'CONFIRMED'" class="actions">
              <p class="small" style="margin: 0 0 4px">
                <template v-if="readyIn(o)">Promised in about {{ readyIn(o) }} min (by {{ clock(o.estimatedReadyAt) }}).</template>
                <template v-else>Past the promised time. Let the customer know if you are delayed.</template>
              </p>
              <button class="btn btn-primary block" :disabled="busyId === o.id" @click="act(o, () => api.merchant.ready(o.id), 'Marked ready.')">Mark ready</button>
              <button class="btn btn-text block" :disabled="busyId === o.id" @click="decline(o)">Cannot fulfil: cancel and refund</button>
            </div>

            <div v-else-if="o.status === 'READY'" class="actions">
              <template v-if="o.fulfilment === 'PICKUP'">
                <p class="small" style="margin: 0 0 4px">Waiting for {{ o.customer?.name }} to collect. Ask for their 4-digit PIN.</p>
                <button class="btn btn-primary block" @click="openPin(o)">Hand over with PIN</button>
              </template>
              <template v-else-if="o.fulfilment === 'MERCHANT_DELIVERY'">
                <button class="btn btn-primary block" :disabled="busyId === o.id" @click="act(o, () => api.merchant.dispatch(o.id), 'Out for delivery.')">Send out for delivery</button>
              </template>
              <p v-else class="notice" style="margin: 12px 0 0">
                <template v-if="o.courier">{{ o.courier.name }} is coming to collect this. Hand it over when they arrive.</template>
                <template v-else>Waiting for an ORBIT rider to accept this job.</template>
              </p>
            </div>

            <div v-else-if="o.status === 'ON_THE_WAY'" class="actions">
              <button v-if="o.fulfilment === 'MERCHANT_DELIVERY'" class="btn btn-primary block" @click="openPin(o)">Complete delivery with PIN</button>
              <p v-else class="notice" style="margin: 12px 0 0">With {{ o.courier?.name ?? 'the rider' }}, on the way to the customer.</p>
            </div>
          </li>
        </ul>
      </main>

      <PinSheet
        :open="!!pinOrder"
        :title="pinOrder?.fulfilment === 'PICKUP' ? 'Enter the customer’s PIN' : 'Enter the PIN from the customer'"
        :subtitle="`Order ${pinOrder?.waybillNo ?? ''}. The customer sees this PIN in their app once they have paid.`"
        :confirm="pinOrder?.fulfilment === 'PICKUP' ? 'Confirm handover' : 'Confirm delivery'"
        :busy="pinBusy"
        :error="pinError"
        @close="pinOrder = null"
        @submit="submitPin"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.open {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.block {
  display: block;
}
.orders {
  list-style: none;
  margin: 0;
  padding: 0;
}
.order {
  padding: 18px 0 20px 16px;
  border-bottom: 1px solid var(--line);
  position: relative;
}
.order::before {
  content: '';
  position: absolute;
  left: 0;
  top: 18px;
  bottom: 20px;
  width: 4px;
  border-radius: 2px;
  background: var(--bar, var(--line));
}
.items {
  list-style: none;
  margin: 12px 0;
  padding: 0;
  font-size: var(--t-md);
  line-height: 1.5;
}
.call {
  display: inline-block;
  margin-top: 12px;
  color: var(--ink);
  text-underline-offset: 3px;
  padding: 8px 0;
}
.actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
