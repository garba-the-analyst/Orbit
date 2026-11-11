<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { onCourierMoved, useLive } from '../../api/socket';
import MapView, { type MapMarker } from '../../components/MapView.vue';
import { useAppConfig } from '../../stores/appConfig';
import type { OrderView } from '../../api/types';
import OrbitTracker from '../../components/OrbitTracker.vue';
import PinStub from '../../components/PinStub.vue';
import ShopSign from '../../components/ShopSign.vue';
import { clock, firstName, minutesUntil, money, VEHICLE_LABEL, when } from '../../lib/format';
import { FULFILMENT_LABEL, stopIndex, stopsFor, trackerTitle } from '../../lib/status';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
const naira = (v: number) => money(v, order.value?.currency);

const route = useRoute();
const router = useRouter();

const order = ref<OrderView | null>(null);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const now = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval>;
onMounted(() => (clockTimer = setInterval(() => (now.value = Date.now()), 30_000)));
onBeforeUnmount(() => clearInterval(clockTimer));

const cfg = useAppConfig();
const courierPos = ref<{ lat: number; lng: number; heading: number | null } | null>(null);
let offMove: (() => void) | undefined;
onMounted(() => {
  offMove = onCourierMoved((p) => {
    if (p.orderId === orderId.value) courierPos.value = { lat: p.lat, lng: p.lng, heading: p.heading };
  });
});
onBeforeUnmount(() => offMove?.());

/** The map shows once the order is on its way: shop, drop-off and the courier moving live. */
const showMap = computed(() => !!order.value && order.value.status === 'ON_THE_WAY' && order.value.fulfilment !== 'PICKUP' && order.value.dropoff?.lat != null);
const markers = computed<MapMarker[]>(() => {
  const o = order.value;
  if (!o) return [];
  const m: MapMarker[] = [];
  if (o.shop.lat != null && o.shop.lng != null) m.push({ id: 'shop', kind: 'shop', lat: o.shop.lat, lng: o.shop.lng, label: o.shop.name });
  if (o.dropoff?.lat != null && o.dropoff.lng != null) m.push({ id: 'drop', kind: 'drop', lat: o.dropoff.lat, lng: o.dropoff.lng, label: 'You' });
  if (courierPos.value) m.push({ id: 'courier', kind: 'driver', ...courierPos.value, vehicle: o.courier?.vehicle ?? undefined });
  return m;
});

async function loadTracking() {
  try {
    const t = await api.orderTracking(orderId.value);
    if (t.courier) courierPos.value = { lat: t.courier.lat, lng: t.courier.lng, heading: t.courier.heading };
  } catch {
    /* the live signal fills it in */
  }
}

const orderId = computed(() => route.params.id as string);

async function load() {
  if (!orderId.value) return;
  error.value = '';
  try {
    order.value = await api.order(orderId.value);
    if (order.value.status === 'ON_THE_WAY') loadTracking();
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

const stops = computed(() => (order.value ? stopsFor(order.value.fulfilment) : []));
const index = computed(() => (order.value ? stopIndex(order.value) : -1));

const stopTime = (key: string): string | null => {
  const t = order.value?.timeline;
  if (!t) return null;
  const map: Record<string, string | null> = {
    PLACED: t.paidAt,
    CONFIRMED: t.confirmedAt,
    READY: t.readyAt,
    ON_THE_WAY: t.pickedUpAt,
    DELIVERED: t.deliveredAt,
  };
  return map[key] ?? null;
};

/** The sentence under the tracker title: the one thing the customer wants to know right now. */
const sub = computed(() => {
  const o = order.value;
  if (!o) return '';
  const who = o.courier ? firstName(o.courier.name) : null;
  switch (o.status) {
    case 'PENDING_PAYMENT':
      return 'Pay to send it to the shop.';
    case 'PLACED':
      return `Waiting for ${o.shop.name} to confirm.`;
    case 'CONFIRMED': {
      const m = minutesUntil(o.estimatedReadyAt, now.value);
      return m ? `Ready in about ${m} min.` : 'Should be ready any moment.';
    }
    case 'READY':
      if (o.fulfilment === 'PICKUP') return `Collect it from ${o.shop.address}.`;
      if (o.fulfilment === 'MERCHANT_DELIVERY') return 'The shop is sending it out.';
      return who ? `${who} is collecting it.` : 'Finding a rider near the shop.';
    case 'ON_THE_WAY':
      return who ? `${who} is bringing it to you.` : 'The shop is bringing it to you.';
    case 'DELIVERED':
      return when(o.timeline.deliveredAt);
    case 'CANCELLED':
      return o.cancelledBy === 'MERCHANT' ? 'The shop could not fulfil it.' : o.cancelledBy === 'SYSTEM' ? 'Payment was not completed in time.' : 'You cancelled this order.';
  }
});

const pinHint = computed(() =>
  order.value?.fulfilment === 'PICKUP'
    ? 'Show this PIN to the shop when you collect your order. Do not share it before.'
    : 'Give this PIN to the person delivering only once your order is in your hands.',
);

const canCancel = computed(() => order.value && ['PENDING_PAYMENT', 'PLACED'].includes(order.value.status));
const wasPaid = computed(() => !!order.value?.timeline.paidAt);

async function cancel() {
  const o = order.value;
  if (!o) return;
  const ok = await confirmAction({
    title: 'Cancel this order?',
    message: wasPaid.value ? 'You will be refunded in full.' : 'You have not been charged.',
    confirm: 'Cancel order',
    cancel: 'Keep order',
    destructive: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    order.value = await api.cancelOrder(o.id, 'Cancelled by customer');
    toast(wasPaid.value ? 'Order cancelled. Your refund is on its way.' : 'Order cancelled.');
  } catch (e) {
    await showError(e);
    load();
  } finally {
    busy.value = false;
  }
}

// ---- Rating ----------------------------------------------------------------------------------------
const stars = ref(0);
const comment = ref('');
async function rate() {
  if (!order.value || stars.value < 1) return;
  busy.value = true;
  try {
    order.value = await api.rateOrder(order.value.id, stars.value, comment.value.trim() || undefined);
    success();
    toast('Thanks for rating.');
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/c/orders" text="" /></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen" style="padding-bottom: 56px">
        <div v-if="loading" class="skeleton" style="height: 264px; width: 264px; border-radius: 50%; margin: 24px auto" role="status" aria-label="Loading"></div>

        <div v-else-if="error" class="notice bad" role="alert">
          {{ error }}
          <button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="order">
          <section class="hero">
            <OrbitTracker :count="stops.length" :index="index" :cancelled="order.status === 'CANCELLED'" :title="trackerTitle(order)" :sub="sub" />
            <div v-if="showMap" class="omap"><MapView :center="{ lat: order.dropoff!.lat!, lng: order.dropoff!.lng! }" :markers="markers" fit :tile-url="cfg.config.map.tileUrl" :attribution="cfg.config.map.attribution" /></div>
            <p class="waybill xsmall muted">
              Waybill <span class="strong num">{{ order.waybillNo }}</span> · {{ FULFILMENT_LABEL[order.fulfilment] }}
            </p>
          </section>

          <button v-if="order.status === 'PENDING_PAYMENT'" class="btn btn-primary block" @click="router.push(`/c/pay/${order.id}`)">
            Pay {{ naira(order.total) }}
          </button>

          <PinStub v-if="order.pin" :pin="order.pin" :locked="order.pinLocked" :hint="pinHint" />

          <div v-if="order.status === 'CANCELLED'" class="notice" :class="wasPaid ? 'good' : ''">
            <span v-if="wasPaid">Your payment of {{ naira(order.total) }} has been refunded.</span>
            <span v-else>You were not charged for this order.</span>
            <span v-if="order.cancelReason" class="muted block"> Reason: {{ order.cancelReason }}.</span>
          </div>

          <section v-if="order.courier && ['CONFIRMED', 'READY', 'ON_THE_WAY'].includes(order.status)" class="card-row" aria-label="Your rider">
            <div class="grow">
              <div class="strong">{{ order.courier.name }}</div>
              <div class="small muted">{{ order.courier.vehicle ? VEHICLE_LABEL[order.courier.vehicle] : 'Rider' }}</div>
            </div>
            <a class="btn btn-quiet small-btn" :href="`tel:${order.courier.phone}`">Call rider</a>
          </section>

          <section v-if="order.status !== 'CANCELLED'" aria-label="Progress">
            <h2 class="heading">Progress</h2>
            <ol class="stops">
              <li v-for="(s, i) in stops" :key="s.key" :class="{ done: i <= index, now: i === index }">
                <span class="mark" aria-hidden="true"></span>
                <span class="grow">{{ s.label }}</span>
                <span class="small muted num">{{ stopTime(s.key) ? clock(stopTime(s.key)) : '' }}</span>
                <span v-if="i === index" class="sr-only">(current step)</span>
              </li>
            </ol>
          </section>

          <section aria-label="Order details">
            <h2 class="heading">Your order</h2>
            <div class="row" style="margin: 12px 0 4px">
              <ShopSign :name="order.shop.name" :color="order.shop.color" :size="40" />
              <div class="grow">
                <div class="strong">{{ order.shop.name }}</div>
                <div class="small muted">{{ order.shop.address }}</div>
              </div>
            </div>
            <ul class="list" style="margin-top: 8px">
              <li v-for="i in order.items" :key="i.productId" class="kv" style="padding: 10px 0">
                <span>{{ i.qty }} × {{ i.name }}</span>
                <span class="money">{{ naira(i.qty * i.unitPrice) }}</span>
              </li>
            </ul>
            <div class="kv"><span class="muted">Items</span><span class="money">{{ naira(order.subtotal) }}</span></div>
            <div class="kv"><span class="muted">{{ order.fulfilment === 'PICKUP' ? 'Pickup' : 'Delivery' }}</span><span class="money">{{ order.deliveryFee ? naira(order.deliveryFee) : 'Free' }}</span></div>
            <div class="kv total"><span>Total</span><span class="money">{{ naira(order.total) }}</span></div>
            <p v-if="order.deliveryAddress" class="small" style="margin: 14px 0 0">
              <span class="strong">Deliver to:</span> {{ order.deliveryAddress }}<template v-if="order.deliveryNote"> · {{ order.deliveryNote }}</template>
            </p>
          </section>

          <section v-if="order.status === 'DELIVERED'" class="rate" aria-label="Rate this order">
            <template v-if="order.rating === null">
              <h2 class="heading">How was {{ order.shop.name }}?</h2>
              <div class="stars" role="radiogroup" aria-label="Rating">
                <button v-for="n in 5" :key="n" type="button" role="radio" :aria-checked="stars === n" :aria-label="`${n} out of 5`" :class="{ on: n <= stars }" @click="stars = n">★</button>
              </div>
              <input v-model="comment" class="input" maxlength="300" placeholder="Add a comment (optional)" style="margin-top: 12px" />
              <button class="btn btn-ink block" style="margin-top: 12px" :disabled="stars < 1 || busy" @click="rate">Send rating</button>
            </template>
            <p v-else class="small" style="margin: 0">
              You rated this order <span class="strong">{{ order.rating }} out of 5</span><template v-if="order.reviewText">: “{{ order.reviewText }}”</template>.
            </p>
          </section>

          <button v-if="canCancel" class="btn btn-bad block" :disabled="busy" @click="cancel">Cancel order</button>
          <p v-else-if="order.status === 'CONFIRMED'" class="xsmall muted" style="text-align: center; margin: 0">
            The shop has started on your order, so it can no longer be cancelled here.
          </p>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.omap {
  height: 220px;
  margin-top: 16px;
  border-radius: 18px;
  overflow: hidden;
  position: relative;
}
main > * + * {
  margin-top: 24px;
}
.hero {
  padding-top: 12px;
}
.waybill {
  text-align: center;
  margin: 18px 0 0;
}
.card-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.stops {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.stops li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  color: var(--slate-faint);
  position: relative;
}
.stops li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 30px;
  bottom: -8px;
  width: 2px;
  background: var(--line);
}
.stops li.done:not(:last-child)::after {
  background: var(--ink);
}
.stops .mark {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--paper);
  box-shadow: inset 0 0 0 2px var(--line);
  position: relative;
  z-index: 1;
}
.stops li.done {
  color: var(--ink);
}
.stops li.done .mark {
  background: var(--ink);
  box-shadow: none;
}
.stops li.now .mark {
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--ink);
}
.stops li.now {
  font-weight: 600;
}
.block {
  display: block;
}
.rate {
  padding: 20px;
  border-radius: 18px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.stars {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.stars button {
  appearance: none;
  border: 0;
  background: none;
  width: 48px;
  height: 48px;
  font-size: 2rem;
  line-height: 1;
  color: var(--line);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.stars button.on {
  color: var(--signal);
  text-shadow: 0 0 0 var(--ink);
  -webkit-text-stroke: 1.5px var(--ink);
}
</style>
