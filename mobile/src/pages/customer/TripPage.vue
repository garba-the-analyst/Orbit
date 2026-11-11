<script setup lang="ts">
/**
 * Follow a trip from request to receipt: searching radar, driver on the way (live map, PIN, call, share, SOS),
 * in progress, then rating and tip. One page for every state, driven by the trip's status and the server's
 * permissions (`cancel`, `canRate`, `canTip`), so the screen never offers something the server would refuse.
 */
import { IonContent, IonIcon, IonPage, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import { alertCircleOutline, arrowBackOutline, callOutline, shareSocialOutline, star } from 'ionicons/icons';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { onCourierMoved, useLive } from '../../api/socket';
import type { LatLng, TripView } from '../../api/types';
import Avatar from '../../components/Avatar.vue';
import MapView, { type MapMarker } from '../../components/MapView.vue';
import OrbitMark from '../../components/OrbitMark.vue';
import PinStub from '../../components/PinStub.vue';
import Skeleton from '../../components/Skeleton.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { clock, distance, duration, money } from '../../lib/format';
import { metresBetween, currentPosition } from '../../lib/geo';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';

const route = useRoute();
const router = useRouter();
const cfg = useAppConfig();

const trip = ref<TripView | null>(null);
const error = ref('');
const driverPos = ref<(LatLng & { heading: number | null }) | null>(null);
const now = ref(Date.now());
const stars = ref(0);
const comment = ref('');
const busy = ref(false);
let tick: ReturnType<typeof setInterval> | undefined;
let poll: ReturnType<typeof setInterval> | undefined;
let off: (() => void) | undefined;
let id = '';

const ACTIVE = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
const active = computed(() => !!trip.value && ACTIVE.includes(trip.value.status));

async function load() {
  try {
    const t = await api.trip(id);
    trip.value = t;
    error.value = '';
    if (['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status) && !driverPos.value) {
      api.tripTracking(id).then((r) => r.driver && (driverPos.value = { lat: r.driver.lat, lng: r.driver.lng, heading: r.driver.heading })).catch(() => undefined);
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
}

onIonViewWillEnter(() => {
  id = String(route.params.id);
  trip.value = null;
  driverPos.value = null;
  stars.value = 0;
  load();
  now.value = Date.now();
  tick = setInterval(() => (now.value = Date.now()), 1000);
  poll = setInterval(() => active.value && load(), 15_000);
  off = onCourierMoved((p) => {
    if (p.tripId === id) driverPos.value = { lat: p.lat, lng: p.lng, heading: p.heading };
  });
});
onIonViewWillLeave(stop);
onBeforeUnmount(stop);
function stop() {
  clearInterval(tick);
  clearInterval(poll);
  off?.();
}
useLive(['trip.updated', 'connect'], () => id && load());

const secondsLeft = computed(() => (trip.value?.search?.expiresAt ? Math.max(0, Math.round((new Date(trip.value.search.expiresAt).getTime() - now.value) / 1000)) : 0));
const kmAway = computed(() => (driverPos.value && trip.value ? metresBetween(driverPos.value, trip.value.status === 'IN_PROGRESS' ? trip.value.drop : trip.value.pickup) : null));

const markers = computed<MapMarker[]>(() => {
  const t = trip.value;
  if (!t) return [];
  const list: MapMarker[] = [
    { id: 'p', kind: 'pickup', lat: t.pickup.lat, lng: t.pickup.lng },
    { id: 'd', kind: 'drop', lat: t.drop.lat, lng: t.drop.lng },
  ];
  if (driverPos.value) list.push({ id: 'drv', kind: 'driver', ...driverPos.value });
  return list;
});

const headline = computed(() => {
  const t = trip.value;
  if (!t) return '';
  switch (t.status) {
    case 'SEARCHING':
      return `Finding your ${t.vehicleLabel.toLowerCase()}…`;
    case 'ACCEPTED':
      return `${t.driver?.firstName ?? 'Your driver'} is on the way`;
    case 'ARRIVED':
      return `${t.driver?.firstName ?? 'Your driver'} has arrived`;
    case 'IN_PROGRESS':
      return t.kind === 'RIDE' ? 'On your way' : 'Your parcel is on its way';
    case 'COMPLETED':
      return t.kind === 'RIDE' ? 'You have arrived' : 'Delivered';
    case 'NO_DRIVER':
      return 'No driver available';
    default:
      return 'Trip cancelled';
  }
});

async function cancel() {
  const t = trip.value;
  if (!t?.cancel?.allowed) return;
  const fee = t.cancel.fee;
  const ok = await confirmAction({
    title: 'Cancel this trip?',
    message: fee > 0 ? `A driver is already on the way, so a cancellation fee of ${money(fee, t.currency)} applies.` : 'It is free to cancel now.',
    confirm: fee > 0 ? `Cancel and pay ${money(fee, t.currency)}` : 'Cancel trip',
    destructive: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    trip.value = await api.cancelTrip(id);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function share() {
  try {
    const res = await api.shareTrip(id);
    const url = res.url ?? `${location.origin}/track/${res.token}`;
    const text = `Follow my ORBIT trip live: ${url}`;
    if (navigator.share) await navigator.share({ title: 'My ORBIT trip', text, url }).catch(() => undefined);
    else {
      await navigator.clipboard?.writeText(text);
      toast('Link copied. Anyone with it can follow this trip.');
    }
    await load();
  } catch (e) {
    showError(e);
  }
}

async function sos() {
  const ok = await confirmAction({ title: 'Send a safety alert?', message: 'ORBIT’s safety team is told right away and sees your trip and location. If you are in danger, call the police first.', confirm: 'Send alert', destructive: true, cancel: 'Not now' });
  if (!ok) return;
  const fix = await currentPosition(3000);
  try {
    await api.sos(id, undefined, fix ? { lat: fix.lat, lng: fix.lng } : undefined);
    toast('Alert sent. ORBIT safety has been notified.');
  } catch (e) {
    showError(e);
  }
}

const call = (phone: string | null | undefined) => phone && window.open(`tel:${phone}`, '_system');

async function submitRating() {
  if (!stars.value) return;
  busy.value = true;
  try {
    trip.value = await api.rateTrip(id, stars.value, comment.value.trim() || undefined);
    toast('Thanks for rating');
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

/** Tips scale with the fare, so they make sense in every currency. */
const tipChoices = computed(() => {
  const f = trip.value?.price.fullFare ?? 0;
  const step = f >= 2000 ? 100 : f >= 200 ? 10 : 1;
  return [...new Set([0.1, 0.15, 0.25].map((r) => Math.max(1, Math.round((f * r) / step) * step)))];
});
async function tip(amount: number) {
  busy.value = true;
  try {
    trip.value = await api.tipTrip(id, amount);
    toast(`Tip of ${money(amount, trip.value.currency)} sent`);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :scroll-y="false">
      <Skeleton v-if="!trip && !error" kind="map" class="pad" />
      <div v-else-if="error" class="pad"><p class="notice bad">{{ error }}</p><button class="btn btn-line" @click="router.replace('/c/activity')">Back to activity</button></div>

      <div v-else-if="trip" class="trip">
        <div class="mapbox">
          <MapView :center="trip.pickup" :markers="markers" :route="trip.geometry" :bottom-pad="40" :tile-url="cfg.config.map.tileUrl" :attribution="cfg.config.map.attribution" />
          <button class="roundbtn back" type="button" aria-label="Back" @click="router.replace('/c/activity')"><ion-icon :icon="arrowBackOutline" /></button>
          <button v-if="active && trip.status !== 'SEARCHING'" class="roundbtn sosbtn" type="button" aria-label="Safety alert" @click="sos"><ion-icon :icon="alertCircleOutline" />SOS</button>
        </div>

        <div class="panel">
          <p class="code small muted">{{ trip.code }} · {{ trip.kind === 'RIDE' ? 'Ride' : 'Parcel' }}</p>
          <h1>{{ headline }}</h1>

          <!-- Searching -->
          <section v-if="trip.status === 'SEARCHING'" class="search">
            <div class="radar"><OrbitMark :size="76" animate="pulse" /></div>
            <p class="muted center">Asking nearby drivers · round {{ trip.search?.wave ?? 1 }} of {{ trip.search?.maxWaves ?? 3 }}<template v-if="secondsLeft"> · {{ secondsLeft }}s</template></p>
            <p class="small muted center">{{ money(trip.price.total, trip.currency) }} · {{ trip.price.method === 'CASH' ? 'Pay the driver in cash' : 'Card' }}</p>
          </section>

          <!-- Driver assigned -->
          <template v-if="trip.driver && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(trip.status)">
            <section class="driver">
              <Avatar :name="trip.driver.name ?? trip.driver.firstName" :size="52" />
              <div class="who">
                <strong>{{ trip.driver.name ?? trip.driver.firstName }}</strong>
                <span class="small muted"><ion-icon :icon="star" class="gold" /> {{ trip.driver.rating.average?.toFixed(1) ?? 'New' }}<template v-if="trip.driver.rating.count"> ({{ trip.driver.rating.count }})</template></span>
              </div>
              <button class="roundbtn flat" type="button" aria-label="Call driver" @click="call(trip.driver?.phone)"><ion-icon :icon="callOutline" /></button>
            </section>
            <section v-if="trip.vehicle" class="veh">
              <VehicleIcon :type="trip.vehicleType" :size="44" />
              <div class="who">
                <strong>{{ [trip.vehicle.color, trip.vehicle.make, trip.vehicle.model].filter(Boolean).join(' ') || trip.vehicleLabel }}</strong>
                <span class="small muted">{{ trip.vehicleLabel }}</span>
              </div>
              <span v-if="trip.vehicle.plate" class="plate">{{ trip.vehicle.plate }}</span>
            </section>
            <p v-if="kmAway !== null && trip.status !== 'ARRIVED'" class="small muted">{{ distance(kmAway) }} {{ trip.status === 'IN_PROGRESS' ? 'to the drop-off' : 'away' }}</p>
          </template>

          <PinStub
            v-if="trip.pin && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(trip.status)"
            :pin="trip.pin.code"
            :locked="trip.pinLocked"
            :hint="trip.pin.purpose === 'start' ? 'Tell the driver this PIN when you get in. It proves they have the right passenger.' : 'Give this PIN to the recipient. The driver needs it to complete the delivery.'"
          />

          <section v-if="active" class="stops">
            <div><i class="a"></i><span><small>From</small>{{ trip.pickup.address }}</span></div>
            <div><i class="b"></i><span><small>To</small>{{ trip.drop.address }}</span></div>
          </section>

          <!-- Active actions -->
          <div v-if="active && trip.status !== 'SEARCHING'" class="actions">
            <button class="btn btn-line" type="button" @click="share"><ion-icon :icon="shareSocialOutline" />{{ trip.shared ? 'Sharing' : 'Share trip' }}</button>
            <button v-if="trip.cancel?.allowed" class="btn btn-line danger" type="button" :disabled="busy" @click="cancel">Cancel</button>
          </div>
          <button v-if="trip.status === 'SEARCHING'" class="btn btn-line" type="button" :disabled="busy" @click="cancel">Cancel request</button>

          <!-- Receipt -->
          <section v-if="trip.status === 'COMPLETED'" class="receipt">
            <div class="kv"><span>Trip</span><b>{{ distance(trip.distanceM) }} · {{ duration(trip.durationS) }}</b></div>
            <div class="kv"><span>Fare</span><b>{{ money(trip.price.fullFare, trip.currency) }}</b></div>
            <div v-if="trip.price.discount" class="kv"><span>Promo {{ trip.price.promoCode }}</span><b class="good">−{{ money(trip.price.discount, trip.currency) }}</b></div>
            <div v-if="trip.price.tip" class="kv"><span>Tip</span><b>{{ money(trip.price.tip, trip.currency) }}</b></div>
            <div class="kv total"><span>Total · {{ trip.price.method === 'CASH' ? 'Cash' : 'Card' }}</span><b>{{ money(trip.price.total + trip.price.tip, trip.currency) }}</b></div>
            <p v-if="trip.times.completedAt" class="small muted">Completed at {{ clock(trip.times.completedAt) }}</p>
          </section>

          <section v-if="trip.status === 'COMPLETED' && trip.canRate" class="rate">
            <strong>How was {{ trip.driver?.firstName ?? 'your driver' }}?</strong>
            <div class="stars">
              <button v-for="n in 5" :key="n" type="button" :aria-label="`${n} star${n > 1 ? 's' : ''}`" :class="{ on: n <= stars }" @click="stars = n"><ion-icon :icon="star" /></button>
            </div>
            <input v-if="stars" v-model="comment" class="input" maxlength="200" placeholder="Add a comment (optional)" />
            <button class="btn btn-primary" type="button" :disabled="!stars || busy" @click="submitRating">Submit rating</button>
          </section>
          <p v-else-if="trip.status === 'COMPLETED' && trip.ratings.given" class="small muted">You rated {{ trip.ratings.given }}★</p>

          <section v-if="trip.status === 'COMPLETED' && trip.canTip" class="tip">
            <strong>Add a tip</strong>
            <div class="chips">
              <button v-for="a in tipChoices" :key="a" class="chip" type="button" :disabled="busy" @click="tip(a)">{{ money(a, trip.currency) }}</button>
            </div>
          </section>

          <!-- Ended without a ride -->
          <template v-if="trip.status === 'NO_DRIVER' || trip.status === 'CANCELLED'">
            <p class="muted">{{ trip.status === 'NO_DRIVER' ? 'No driver accepted this time. You were not charged.' : trip.cancelReason ?? 'This trip was cancelled.' }}<template v-if="trip.price.cancelFee"> A cancellation fee of {{ money(trip.price.cancelFee, trip.currency) }} applies.</template></p>
            <button class="btn btn-primary" type="button" @click="router.replace(`/c/book/${trip.kind === 'RIDE' ? 'ride' : 'parcel'}`)">Try again</button>
          </template>
          <button v-if="trip.status === 'COMPLETED'" class="btn btn-ink" type="button" @click="router.replace('/c/home')">Done</button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.pad {
  padding: calc(env(safe-area-inset-top, 0px) + 20px) var(--gutter);
}
.trip {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.mapbox {
  position: relative;
  flex: 0 0 40%;
  min-height: 210px;
}
.roundbtn {
  position: absolute;
  z-index: 600;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 0;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-lg);
  font-size: 22px;
  display: grid;
  place-items: center;
}
.roundbtn.flat {
  position: static;
  box-shadow: none;
  border: 1.5px solid var(--line);
}
.back {
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
}
.sosbtn {
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: 12px;
  width: auto;
  padding: 0 14px;
  border-radius: 21px;
  gap: 6px;
  background: var(--bad);
  color: #fff;
  font: 700 var(--t-sm) var(--font-display);
  grid-auto-flow: column;
}
.panel {
  flex: 1;
  overflow-y: auto;
  margin-top: -18px;
  position: relative;
  z-index: 700;
  padding: 18px var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 24px);
  border-radius: 22px 22px 0 0;
  background: var(--paper);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: sheet-up 0.5s var(--ease) both;
}
@keyframes sheet-up {
  from {
    transform: translateY(40px);
    opacity: 0;
  }
}
.code {
  margin: 0;
}
h1 {
  margin: -8px 0 0;
  font: 700 var(--t-xl) var(--font-display);
  letter-spacing: -0.02em;
}
.center {
  text-align: center;
  margin: 0;
}
.search {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
}
.radar {
  display: grid;
  place-items: center;
  width: 130px;
  height: 130px;
}
.driver,
.veh {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.who strong {
  font-family: var(--font-display);
}
.gold {
  color: var(--signal);
  vertical-align: -2px;
}
.plate {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--signal);
  color: var(--on-signal);
  font: 800 var(--t-md) var(--font-display);
  letter-spacing: 0.06em;
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
.actions {
  display: flex;
  gap: 10px;
}
.actions .btn {
  flex: 1;
  gap: 8px;
}
.danger {
  color: var(--bad);
  border-color: var(--bad);
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
.rate,
.tip {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  text-align: center;
}
.stars {
  display: flex;
  gap: 6px;
}
.stars button {
  border: 0;
  background: none;
  font-size: 40px;
  color: var(--line);
  padding: 0;
  transition: transform var(--dur-2) var(--ease), color var(--dur-2);
}
.stars button.on {
  color: var(--signal);
  transform: scale(1.12);
}
.rate .input,
.rate .btn {
  width: 100%;
}
</style>
