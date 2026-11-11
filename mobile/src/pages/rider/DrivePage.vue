<script setup lang="ts">
/**
 * The driver's home: go online, receive ride / parcel / freight requests with a countdown, and run the active trip
 * (navigate, arrived, PIN, start, complete). Everything the driver needs while on the road is on this one screen.
 */
import { IonContent, IonIcon, IonPage, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { callOutline, navigateOutline, star, warningOutline } from 'ionicons/icons';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OfferView, TripView } from '../../api/types';
import Avatar from '../../components/Avatar.vue';
import BellButton from '../../components/BellButton.vue';
import MapView, { type MapMarker } from '../../components/MapView.vue';
import OrbitMark from '../../components/OrbitMark.vue';
import PinEntry from '../../components/PinEntry.vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { distance, duration, firstName, money } from '../../lib/format';
import { openNavigation } from '../../lib/geo';
import { autoTour } from '../../lib/tour';
import { confirmAction, errorMessage, showError, success, tap, toast } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';
import { useAuth } from '../../stores/auth';
import { useDriver } from '../../stores/driver';

const auth = useAuth();
const drv = useDriver();
const cfg = useAppConfig();
const router = useRouter();

const offers = ref<OfferView[]>([]);
const trip = ref<TripView | null>(null);
const loading = ref(true);
const busy = ref(false);
const pin = ref('');
const pinBad = ref(false);
const stars = ref(0);
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
let known = new Set<string>();

const approved = computed(() => auth.user?.status === 'ACTIVE');
const ACTIVE = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
const running = computed(() => !!trip.value && ACTIVE.includes(trip.value.status));

async function load() {
  try {
    const [o, t] = await Promise.all([drv.online ? api.rider.offers() : Promise.resolve([] as OfferView[]), api.rider.activeTrip()]);
    if (o.some((x) => !known.has(x.tripId))) tap();
    known = new Set(o.map((x) => x.tripId));
    offers.value = o;
    const next = 'none' in t ? null : t;
    if (next?.id !== trip.value?.id) {
      pin.value = '';
      stars.value = 0;
    }
    // Keep a just-completed trip on screen (for the receipt and rating) until the driver dismisses it.
    trip.value = next ?? (trip.value && trip.value.status === 'COMPLETED' ? trip.value : null);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    loading.value = false;
  }
}

onIonViewWillEnter(async () => {
  await auth.refresh().catch(() => undefined);
  drv.sync();
  await load();
  now.value = Date.now();
  clearInterval(tick);
  tick = setInterval(() => {
    now.value = Date.now();
    if (drv.online && !running.value && Math.round(now.value / 1000) % 8 === 0) load();
  }, 1000);
  autoTour('driver');
});
onBeforeUnmount(() => clearInterval(tick));
useLive(['offers.changed', 'trip.updated', 'connect', 'account.updated'], load);

const left = (o: OfferView) => Math.max(0, Math.round((new Date(o.expiresAt).getTime() - now.value) / 1000));
const live = computed(() => offers.value.filter((o) => left(o) > 0));

async function accept(o: OfferView) {
  busy.value = true;
  try {
    trip.value = await api.rider.acceptOffer(o.tripId);
    success();
    await load();
  } catch (e) {
    await showError(e);
    load();
  } finally {
    busy.value = false;
  }
}
async function decline(o: OfferView) {
  offers.value = offers.value.filter((x) => x.tripId !== o.tripId);
  api.rider.declineOffer(o.tripId).catch(() => undefined);
}

async function act(fn: () => Promise<TripView>) {
  busy.value = true;
  pinBad.value = false;
  try {
    trip.value = await fn();
    pin.value = '';
    tap();
  } catch (e) {
    const msg = errorMessage(e);
    if (/pin/i.test(msg)) pinBad.value = true;
    await showError(e);
    pin.value = '';
  } finally {
    busy.value = false;
  }
}
const arrived = () => act(() => api.rider.arrived(trip.value!.id, drv.pos ? { lat: drv.pos.lat, lng: drv.pos.lng } : undefined));
const start = () => act(() => api.rider.startTrip(trip.value!.id, pin.value || undefined));
const complete = () => act(() => api.rider.completeTrip(trip.value!.id, pin.value || undefined));

async function cancel() {
  const ok = await confirmAction({ title: 'Cancel this trip?', message: 'The customer is told and we look for another driver. Cancelling too often can pause your account.', confirm: 'Cancel trip', cancel: 'Keep trip', destructive: true });
  if (ok) await act(() => api.rider.cancelTrip(trip.value!.id));
  if (!trip.value || trip.value.status === 'CANCELLED') trip.value = null;
}

async function rate() {
  if (!trip.value || !stars.value) return;
  try {
    await api.rider.rateCustomer(trip.value.id, stars.value);
    toast('Thanks for rating');
    trip.value = null;
  } catch (e) {
    showError(e);
  }
}

const markers = computed<MapMarker[]>(() => {
  const t = trip.value;
  const list: MapMarker[] = [];
  if (t) list.push({ id: 'p', kind: 'pickup', lat: t.pickup.lat, lng: t.pickup.lng }, { id: 'd', kind: 'drop', lat: t.drop.lat, lng: t.drop.lng });
  if (drv.pos) list.push({ id: 'me', kind: 'driver', lat: drv.pos.lat, lng: drv.pos.lng, heading: drv.pos.heading });
  return list;
});
const target = computed(() => (trip.value?.status === 'IN_PROGRESS' ? trip.value.drop : trip.value?.pickup) ?? null);
const mapCenter = computed(() => drv.pos ?? cfg.mapCenter);
const needsStartPin = computed(() => trip.value?.kind === 'RIDE' && trip.value.status === 'ARRIVED');
const needsDropPin = computed(() => trip.value?.kind === 'PARCEL' && trip.value.status === 'IN_PROGRESS');
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen drive">
        <header class="top">
          <Avatar :name="auth.user?.name ?? ''" :src="auth.user?.avatarUrl" :size="44" />
          <div class="grow"><small class="muted">Driver</small><h1>{{ firstName(auth.user?.name ?? '') }}</h1></div>
          <ThemeToggle /><BellButton />
        </header>

        <label class="status" :class="{ on: drv.online }" data-tour="online">
          <span class="grow">
            <strong>{{ drv.online ? 'You are online' : 'You are offline' }}</strong>
            <small>{{ drv.online ? (live.length ? `${live.length} request${live.length > 1 ? 's' : ''} waiting` : 'Waiting for requests near you…') : 'Go online to receive requests' }}</small>
          </span>
          <ion-toggle :checked="drv.online" :disabled="drv.switching || !approved || (running && drv.online)" aria-label="Go online" @ionChange="drv.setOnline($event.detail.checked)" />
        </label>

        <p v-if="!approved" class="notice warn">Your account is being verified. Upload your documents in the <button class="btn-text inline" type="button" @click="router.push('/r/garage')">Garage</button> so we can approve you faster.</p>
        <p v-if="drv.gpsDenied" class="notice bad"><ion-icon :icon="warningOutline" /> Location is off. ORBIT needs your location to match you with nearby trips. Allow it in your phone settings.</p>

        <!-- Active trip -->
        <section v-if="trip" class="active">
          <div class="mapbox">
            <MapView :center="mapCenter" :markers="markers" :route="trip.geometry" :tile-url="cfg.config.map.tileUrl" :attribution="cfg.config.map.attribution" />
          </div>
          <div class="card">
            <p class="small muted code">{{ trip.code }} · {{ trip.kind === 'RIDE' ? 'Ride' : 'Parcel' }} · {{ trip.vehicleLabel }}</p>
            <h2 v-if="trip.status === 'ACCEPTED'">Head to the pickup</h2>
            <h2 v-else-if="trip.status === 'ARRIVED'">Waiting for {{ trip.customer?.firstName ?? 'the customer' }}</h2>
            <h2 v-else-if="trip.status === 'IN_PROGRESS'">{{ trip.kind === 'RIDE' ? 'Take them to the drop-off' : 'Deliver the parcel' }}</h2>
            <h2 v-else-if="trip.status === 'COMPLETED'">Trip complete</h2>

            <div v-if="trip.customer && trip.status !== 'COMPLETED'" class="who">
              <Avatar :name="trip.customer.firstName" :size="42" />
              <div class="grow"><strong>{{ trip.customer.name ?? trip.customer.firstName }}</strong><br /><span class="small muted"><ion-icon :icon="star" class="gold" /> {{ trip.customer.rating.average?.toFixed(1) ?? 'New' }}</span></div>
              <a v-if="trip.customer.phone" class="roundbtn" :href="`tel:${trip.customer.phone}`" aria-label="Call customer"><ion-icon :icon="callOutline" /></a>
            </div>

            <div v-if="trip.status !== 'COMPLETED'" class="stops">
              <div :class="{ dim: trip.status === 'IN_PROGRESS' }"><i class="a"></i><span><small>Pickup</small>{{ trip.pickup.address }}</span></div>
              <div><i class="b"></i><span><small>Drop-off</small>{{ trip.drop.address }}</span></div>
            </div>
            <p v-if="trip.cargo.goodsLabel" class="small"><b>{{ trip.cargo.goodsLabel }}</b><template v-if="trip.cargo.weightKg"> · {{ trip.cargo.weightKg }} kg</template><template v-if="trip.cargo.handling"> · {{ trip.cargo.handling }}</template></p>
            <p v-if="trip.recipient && trip.status !== 'COMPLETED'" class="small muted">Recipient: {{ trip.recipient.name }}<template v-if="trip.recipient.phone"> · <a :href="`tel:${trip.recipient.phone}`">{{ trip.recipient.phone }}</a></template></p>
            <p v-if="trip.cargo.notes && trip.status !== 'COMPLETED'" class="small muted">Note: {{ trip.cargo.notes }}</p>

            <div v-if="trip.status !== 'COMPLETED'" class="pay">
              <span>You earn <b class="num">{{ money(trip.price.driverEarning ?? 0, trip.currency) }}</b></span>
              <span v-if="trip.price.method === 'CASH'" class="status warn">Collect {{ money(trip.price.collectInCash ?? trip.price.total, trip.currency) }} cash</span>
              <span v-else class="status good">Paid by card</span>
            </div>

            <button v-if="target" class="btn btn-line" type="button" @click="openNavigation(target)"><ion-icon :icon="navigateOutline" /> Navigate</button>

            <template v-if="trip.status === 'ACCEPTED'">
              <button class="btn btn-primary" type="button" :disabled="busy" @click="arrived">I have arrived</button>
              <button class="btn btn-quiet" type="button" :disabled="busy" @click="cancel">Cancel trip</button>
            </template>
            <template v-else-if="trip.status === 'ARRIVED'">
              <div v-if="needsStartPin" class="pinbox"><p class="small">Ask the passenger for their 4-digit PIN.</p><PinEntry v-model="pin" :invalid="pinBad" :disabled="busy" @complete="start" /></div>
              <button class="btn btn-primary" type="button" :disabled="busy || (needsStartPin && pin.length < 4)" @click="start">Start trip</button>
              <button class="btn btn-quiet" type="button" :disabled="busy" @click="cancel">Customer did not show: cancel</button>
            </template>
            <template v-else-if="trip.status === 'IN_PROGRESS'">
              <div v-if="needsDropPin" class="pinbox"><p class="small">Ask the recipient for the 4-digit delivery PIN.</p><PinEntry v-model="pin" :invalid="pinBad" :disabled="busy" @complete="complete" /></div>
              <button class="btn btn-primary" type="button" :disabled="busy || (needsDropPin && pin.length < 4)" @click="complete">{{ trip.kind === 'RIDE' ? 'Complete trip' : 'Complete delivery' }}</button>
            </template>
            <template v-else-if="trip.status === 'COMPLETED'">
              <div class="receipt">
                <div class="kv"><span>Fare</span><b>{{ money(trip.price.fullFare, trip.currency) }}</b></div>
                <div class="kv total"><span>You earned</span><b>{{ money(trip.price.driverEarning ?? 0, trip.currency) }}</b></div>
                <p v-if="trip.price.method === 'CASH'" class="notice warn">Collect {{ money(trip.price.collectInCash ?? trip.price.total, trip.currency) }} in cash. ORBIT’s commission is settled from your card earnings.</p>
              </div>
              <div v-if="trip.canRate" class="rate"><strong>Rate the customer</strong>
                <div class="stars"><button v-for="n in 5" :key="n" type="button" :class="{ on: n <= stars }" :aria-label="`${n} stars`" @click="stars = n"><ion-icon :icon="star" /></button></div>
                <button class="btn btn-primary" type="button" :disabled="!stars" @click="rate">Submit</button>
              </div>
              <button class="btn btn-line" type="button" @click="trip = null">Done</button>
            </template>
          </div>
        </section>

        <!-- Offers -->
        <section v-else-if="drv.online" class="offers" data-tour="offers">
          <h2 class="heading">Requests</h2>
          <div v-if="!live.length" class="idle"><OrbitMark :size="64" animate="pulse" /><p class="muted">Looking for trips near you…</p></div>
          <TransitionGroup name="offer" tag="div" class="olist">
            <article v-for="o in live" :key="o.tripId" class="offer">
              <div class="otop">
                <VehicleIcon :type="o.vehicleType" :size="40" />
                <div class="grow"><strong>{{ o.kind === 'RIDE' ? 'Ride' : 'Parcel' }}<template v-if="o.cargo.goodsLabel"> · {{ o.cargo.goodsLabel }}</template></strong><br /><span class="small muted">{{ distance(o.distanceToPickupM) }} to pickup · {{ distance(o.distanceM) }} trip · {{ duration(o.durationS) }}</span></div>
                <div class="ring" :style="{ '--p': Math.min(100, (left(o) / 20) * 100) }"><span>{{ left(o) }}</span></div>
              </div>
              <div class="stops sm"><div><i class="a"></i><span>{{ o.pickup.address }}</span></div><div><i class="b"></i><span>{{ o.drop.address }}</span></div></div>
              <div class="pay"><span>You earn <b class="num">{{ money(o.driverEarning, o.currency) }}</b><em v-if="o.surge > 1"> ×{{ o.surge }}</em></span><span class="status" :class="o.paymentMethod === 'CASH' ? 'warn' : 'good'">{{ o.paymentMethod === 'CASH' ? 'Cash' : 'Card' }}</span></div>
              <div v-if="o.cargo.weightKg || o.cargo.careful" class="small muted">{{ o.cargo.weightKg ? `${o.cargo.weightKg} kg` : '' }}{{ o.cargo.careful ? ' · handle with care' : '' }}{{ o.cargo.urgent ? ' · urgent' : '' }}</div>
              <div class="acts"><button class="btn btn-line" type="button" :disabled="busy" @click="decline(o)">Decline</button><button class="btn btn-primary" type="button" :disabled="busy" @click="accept(o)">Accept</button></div>
            </article>
          </TransitionGroup>
        </section>

        <section v-else-if="!loading" class="off">
          <OrbitMark :size="72" />
          <p class="muted">Switch on “online” to start earning.</p>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.drive {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 32px;
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}
h1 {
  margin: 0;
  font: 700 var(--t-xl) var(--font-display);
}
h2 {
  margin: 0;
  font: 700 var(--t-lg) var(--font-display);
}
.status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--line);
  transition: all var(--dur-3) var(--ease);
}
.status small {
  display: block;
  color: var(--slate);
}
.status.on {
  background: var(--good-wash);
  box-shadow: inset 0 0 0 2px var(--good);
}
.inline {
  padding: 0;
  min-height: 0;
}
.mapbox {
  height: 240px;
  border-radius: 18px;
  overflow: hidden;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.code {
  margin: 0;
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}
.roundbtn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  color: var(--ink);
  font-size: 20px;
  display: grid;
  place-items: center;
}
.gold {
  color: var(--signal);
  vertical-align: -2px;
}
.stops {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stops div {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.stops .dim {
  opacity: 0.45;
}
.stops i {
  margin-top: 6px;
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--ink);
}
.stops i.b {
  border-radius: 2px;
  background: var(--ink);
  box-shadow: none;
}
.stops small {
  display: block;
  color: var(--slate);
  font-size: var(--t-xs);
}
.stops.sm span {
  font-size: var(--t-sm);
}
.pay {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pay b {
  font: 700 var(--t-lg) var(--font-display);
}
.pay em {
  color: var(--warn);
  font-style: normal;
  font-weight: 700;
}
.pinbox {
  padding: 14px;
  border-radius: 14px;
  background: var(--ink-wash);
  text-align: center;
}
.btn ion-icon {
  margin-right: 8px;
}
.receipt {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.kv.total {
  font-size: var(--t-lg);
  border-top: 1px dashed var(--line);
  padding-top: 10px;
  margin-top: 6px;
}
.rate {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.stars {
  display: flex;
  gap: 6px;
}
.stars button {
  border: 0;
  background: none;
  font-size: 36px;
  color: var(--line);
  padding: 0;
}
.stars button.on {
  color: var(--signal);
}
.idle,
.off {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 28px 0;
}
.olist {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.offer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 0 0 2px var(--signal), var(--shadow-lg);
}
.otop {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ring {
  --p: 100;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--signal) calc(var(--p) * 1%), var(--line) 0);
  position: relative;
  font: 700 var(--t-sm) var(--font-display);
}
.ring::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: var(--surface);
}
.ring span {
  position: relative;
}
.acts {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
}
.offer-enter-active,
.offer-leave-active {
  transition: all 0.4s var(--ease);
}
.offer-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.96);
}
.offer-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}
</style>
