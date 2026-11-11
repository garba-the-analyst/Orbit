<script setup lang="ts">
/**
 * One booking screen for three services, chosen by the route (/c/book/ride | parcel | freight):
 *  - ride    people in a bike, keke or car
 *  - parcel  goods around town (bike, keke, car)
 *  - freight heavy goods (van, truck, lorry, long-haul)
 * Pick pickup and drop-off, see every eligible vehicle with its fare and ETA, then request. The price is locked
 * to what is on screen: if demand pushes it up before the request lands, the server says so and we ask again.
 */
import { IonContent, IonIcon, IonPage, onIonViewWillEnter } from '@ionic/vue';
import { arrowBackOutline, cardOutline, cashOutline, flashOutline, pricetagOutline, swapVerticalOutline } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { PaymentMethod, PlaceResult, Point, PromoCheck, Quote, QuoteOption, TripKind } from '../../api/types';
import MapView, { type MapMarker } from '../../components/MapView.vue';
import PlaceSheet from '../../components/PlaceSheet.vue';
import TestModeTag from '../../components/TestModeTag.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { distance, duration, money } from '../../lib/format';
import { currentPosition } from '../../lib/geo';
import { confirmAction, errorMessage, showError, tap, toast } from '../../lib/ui';
import { cleanPhone, phoneError } from '../../lib/validate';
import { useAppConfig } from '../../stores/appConfig';

const route = useRoute();
const router = useRouter();
const cfg = useAppConfig();

type Service = 'ride' | 'parcel' | 'freight';
const service = computed<Service>(() => (['ride', 'parcel', 'freight'].includes(String(route.params.kind)) ? (route.params.kind as Service) : 'ride'));
const kind = computed<TripKind>(() => (service.value === 'ride' ? 'RIDE' : 'PARCEL'));
const heading = computed(() => ({ ride: 'Book a ride', parcel: 'Send a parcel', freight: 'Move heavy goods' })[service.value]);

const pickup = ref<Point | null>(null);
const drop = ref<Point | null>(null);
const sheet = ref<'pickup' | 'drop' | null>(null);

const passengers = ref(1);
const goodsType = ref('GENERAL');
const weight = ref('');
const recipientName = ref('');
const recipientPhone = ref('');
const notes = ref('');

const quote = ref<Quote | null>(null);
const quoting = ref(false);
const quoteError = ref('');
const selected = ref<string | null>(null);
const method = ref<PaymentMethod>('CASH');
const promoText = ref('');
const promo = ref<PromoCheck | null>(null);
const promoMsg = ref('');
const requesting = ref(false);

const goods = computed(() => (cfg.config.goods.length ? cfg.config.goods : [{ type: 'GENERAL', label: 'Other goods' }]));
const center = computed(() => pickup.value ?? cfg.mapCenter);
const currency = computed(() => quote.value?.currency ?? cfg.currency);

const options = computed<QuoteOption[]>(() => {
  const all = quote.value?.options ?? [];
  return all.filter((o) => (service.value === 'freight' ? o.fleet === 'HEAVY' : o.fleet === 'LIGHT'));
});
const chosen = computed(() => options.value.find((o) => o.vehicleType === selected.value) ?? null);

const markers = computed<MapMarker[]>(() => [
  ...(pickup.value ? [{ id: 'p', kind: 'pickup' as const, lat: pickup.value.lat, lng: pickup.value.lng }] : []),
  ...(drop.value ? [{ id: 'd', kind: 'drop' as const, lat: drop.value.lat, lng: drop.value.lng }] : []),
]);

const weightKg = computed(() => {
  const n = Number(weight.value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
});

const discount = computed(() => {
  const o = chosen.value;
  if (!o || !promo.value) return 0;
  const raw = promo.value.type === 'PERCENT' ? Math.floor((o.fare * promo.value.value) / 100) : promo.value.value;
  return Math.min(raw, promo.value.maxDiscount ?? raw, o.fare);
});

onIonViewWillEnter(() => {
  reset();
  locate();
});

function reset() {
  drop.value = null;
  quote.value = null;
  selected.value = null;
  quoteError.value = '';
  promo.value = null;
  promoText.value = '';
  weight.value = service.value === 'freight' ? '500' : service.value === 'parcel' ? '2' : '';
  goodsType.value = 'GENERAL';
  passengers.value = 1;
  method.value = 'CASH';
}

async function locate() {
  if (pickup.value) return;
  const fix = await currentPosition(6000);
  if (!fix || pickup.value) return;
  let address = 'My current location';
  try {
    address = (await api.reverse(fix)).address || address;
  } catch {
    /* keep the generic label */
  }
  pickup.value = { lat: fix.lat, lng: fix.lng, address };
}

function onPick(p: Point) {
  if (sheet.value === 'pickup') pickup.value = p;
  else drop.value = p;
  sheet.value = null;
}
function swap() {
  [pickup.value, drop.value] = [drop.value, pickup.value];
}

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
watch([pickup, drop, passengers, goodsType, weightKg, service], () => {
  clearTimeout(timer);
  quote.value = null;
  selected.value = null;
  quoteError.value = '';
  if (!pickup.value || !drop.value) return;
  if (kind.value === 'PARCEL' && !weightKg.value) return;
  timer = setTimeout(requestQuote, 450);
});

async function requestQuote() {
  const mine = ++seq;
  quoting.value = true;
  try {
    const q = await api.quote({
      kind: kind.value,
      pickup: pickup.value!,
      drop: drop.value!,
      ...(kind.value === 'RIDE' ? { passengers: passengers.value } : { goodsType: goodsType.value, weightKg: weightKg.value! }),
    });
    if (mine !== seq) return;
    quote.value = q;
    const firstAvailable = (q.options.filter((o) => (service.value === 'freight' ? o.fleet === 'HEAVY' : o.fleet === 'LIGHT')).find((o) => o.available) ?? null)?.vehicleType;
    selected.value = firstAvailable ?? null;
    if (promo.value && promo.value.currency !== q.currency) promo.value = null;
  } catch (e) {
    if (mine === seq) quoteError.value = errorMessage(e);
  } finally {
    if (mine === seq) quoting.value = false;
  }
}

async function applyPromo() {
  const code = promoText.value.trim().toUpperCase();
  if (!code) return;
  promoMsg.value = '';
  try {
    promo.value = await api.checkPromo(code, currency.value);
    toast(`${promo.value.code} applied`);
  } catch (e) {
    promo.value = null;
    promoMsg.value = errorMessage(e);
  }
}

const formError = computed(() => {
  if (!pickup.value || !drop.value) return 'Choose where from and where to.';
  if (kind.value === 'PARCEL') {
    if (!weightKg.value) return 'Enter the weight of the goods.';
    if (recipientName.value.trim().length < 2) return 'Enter the recipient’s name.';
    if (phoneError(recipientPhone.value)) return 'Enter the recipient’s phone number.';
  }
  if (!chosen.value) return quote.value ? 'No vehicle is available nearby right now.' : 'Getting prices…';
  return '';
});

async function submit(acceptedSurge = chosen.value!.surge) {
  if (formError.value || requesting.value) return;
  requesting.value = true;
  try {
    const trip = await api.createTrip({
      kind: kind.value,
      pickup: pickup.value!,
      drop: drop.value!,
      vehicleType: chosen.value!.vehicleType,
      paymentMethod: method.value,
      acceptedSurge,
      ...(promo.value ? { promoCode: promo.value.code } : {}),
      ...(kind.value === 'RIDE' ? { passengers: passengers.value } : { goodsType: goodsType.value, weightKg: weightKg.value!, recipientName: recipientName.value.trim(), recipientPhone: cleanPhone(recipientPhone.value) }),
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
    });
    tap();
    router.replace(`/c/trip/${trip.id}`);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
      const cur = e.body?.current as { surge: number; fare: number } | undefined;
      if (cur && (await confirmAction({ title: 'Price went up', message: `Demand is high. The fare is now ${money(cur.fare, currency.value)} (×${cur.surge}). Continue?`, confirm: 'Request at new price', cancel: 'Not now' }))) {
        requesting.value = false;
        return submit(cur.surge);
      }
      requestQuote();
    } else if (e instanceof ApiError && e.code === 'TRIP_IN_PROGRESS') {
      const id = e.body?.tripId as string | undefined;
      toast('You already have a trip in progress.', 'error');
      if (id) router.replace(`/c/trip/${id}`);
    } else showError(e);
  } finally {
    requesting.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :scroll-y="false">
      <div class="book">
        <div class="mapbox">
          <MapView :center="center" :zoom="14" :markers="markers" :route="quote?.route.geometry ?? null" :bottom-pad="0" :tile-url="cfg.config.map.tileUrl" :attribution="cfg.config.map.attribution" />
          <button class="back" type="button" aria-label="Back" @click="router.back()"><ion-icon :icon="arrowBackOutline" /></button>
        </div>

        <div class="panel">
          <h1>{{ heading }}</h1>

          <div class="route">
            <div class="rail"><i class="a"></i><i class="line"></i><i class="b"></i></div>
            <div class="fields">
              <button type="button" class="place" data-testid="pickup" @click="sheet = 'pickup'">
                <small>From</small>
                <span :class="{ ph: !pickup }">{{ pickup?.address ?? 'Choose pickup' }}</span>
              </button>
              <button type="button" class="place" data-testid="drop" @click="sheet = 'drop'">
                <small>To</small>
                <span :class="{ ph: !drop }">{{ drop?.address ?? 'Where to?' }}</span>
              </button>
            </div>
            <button type="button" class="swap" aria-label="Swap" @click="swap"><ion-icon :icon="swapVerticalOutline" /></button>
          </div>

          <!-- What is being carried -->
          <section v-if="service === 'ride'" class="block">
            <div class="row between">
              <strong>Passengers</strong>
              <div class="step">
                <button type="button" :disabled="passengers <= 1" aria-label="Fewer" @click="passengers--">−</button>
                <span class="num">{{ passengers }}</span>
                <button type="button" :disabled="passengers >= 6" aria-label="More" @click="passengers++">+</button>
              </div>
            </div>
          </section>
          <section v-else class="block stack">
            <div>
              <strong>What are you sending?</strong>
              <div class="chips goods">
                <button v-for="g in goods" :key="g.type" type="button" class="chip" :aria-pressed="goodsType === g.type" @click="goodsType = g.type">{{ g.label }}</button>
              </div>
              <p v-if="goods.find((g) => g.type === goodsType)?.handling" class="small muted">{{ goods.find((g) => g.type === goodsType)?.handling }}</p>
            </div>
            <label class="field">
              <span class="label">Total weight (kg)</span>
              <input v-model="weight" class="input" inputmode="decimal" placeholder="e.g. 5" />
            </label>
            <label class="field">
              <span class="label">Recipient name</span>
              <input v-model="recipientName" class="input" autocomplete="name" placeholder="Who receives it" />
            </label>
            <label class="field">
              <span class="label">Recipient phone</span>
              <input v-model="recipientPhone" class="input" inputmode="tel" placeholder="08031234567" />
            </label>
            <label class="field">
              <span class="label">Note for the driver (optional)</span>
              <input v-model="notes" class="input" maxlength="200" placeholder="Gate code, landmark, handling" />
            </label>
          </section>

          <!-- Vehicles and fares -->
          <section class="block">
            <div v-if="quoting" class="sk"><div class="skeleton" v-for="i in 3" :key="i"></div></div>
            <p v-else-if="quoteError" class="notice bad">{{ quoteError }}</p>
            <template v-else-if="quote">
              <p class="small muted trip">{{ distance(quote.route.distanceM) }} · about {{ duration(quote.route.durationS) }}<template v-if="quote.route.source !== 'osrm'"> · estimate</template></p>
              <p v-if="!options.length" class="notice warn">No {{ service === 'freight' ? 'heavy vehicle' : 'vehicle' }} can take this trip. Try a different route or weight.</p>
              <ul class="opts">
                <li v-for="(o, i) in options" :key="o.vehicleType" :style="{ '--n': i }">
                  <button type="button" class="opt" :class="{ on: selected === o.vehicleType }" :disabled="!o.available" @click="selected = o.vehicleType; tap()">
                    <VehicleIcon :type="o.vehicleType" :size="46" />
                    <span class="info">
                      <strong>{{ o.label }}</strong>
                      <small v-if="o.available">{{ o.etaMin }} min away · {{ o.driversNearby }} nearby<template v-if="service === 'ride'"> · up to {{ o.passengers }}</template><template v-else> · up to {{ o.maxWeightKg.toLocaleString() }} kg</template></small>
                      <small v-else>No drivers nearby right now</small>
                    </span>
                    <span class="fare">
                      <b class="num">{{ money(o.fare, quote.currency) }}</b>
                      <em v-if="o.surge > 1"><ion-icon :icon="flashOutline" />×{{ o.surge }}</em>
                    </span>
                  </button>
                </li>
              </ul>
            </template>
            <p v-else class="small muted">{{ formError }}</p>
          </section>

          <!-- Payment and promo -->
          <section v-if="chosen" class="block stack">
            <div class="pay">
              <button type="button" :aria-pressed="method === 'CASH'" @click="method = 'CASH'"><ion-icon :icon="cashOutline" />Cash</button>
              <button type="button" :aria-pressed="method === 'CARD'" @click="method = 'CARD'"><ion-icon :icon="cardOutline" />Card</button>
            </div>
            <TestModeTag v-if="method === 'CARD'" />
            <div class="promo">
              <ion-icon :icon="pricetagOutline" />
              <input v-model="promoText" placeholder="Promo code" autocapitalize="characters" @keyup.enter="applyPromo" />
              <button type="button" class="btn-text" @click="applyPromo">Apply</button>
            </div>
            <p v-if="promoMsg" class="small bad">{{ promoMsg }}</p>
            <p v-if="promo" class="small good">{{ promo.code }} applied: you save {{ money(discount, currency) }}.</p>
          </section>

          <button class="btn btn-primary go" type="button" data-testid="request" :disabled="!!formError || requesting" @click="submit()">
            <template v-if="requesting">Requesting…</template>
            <template v-else-if="chosen">Request {{ chosen.label }} · {{ money(Math.max(0, chosen.fare - discount), currency) }}</template>
            <template v-else>Request</template>
          </button>
          <p v-if="formError && quote && !quoting" class="small muted center">{{ formError }}</p>
        </div>
      </div>

      <PlaceSheet :open="sheet !== null" :title="sheet === 'pickup' ? 'Pickup point' : 'Drop-off point'" :near="pickup" @pick="onPick" @close="sheet = null" />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.book {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.mapbox {
  position: relative;
  flex: 0 0 34%;
  min-height: 190px;
}
.back {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
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
  gap: 16px;
}
h1 {
  margin: 0;
  font: 700 var(--t-xl) var(--font-display);
  letter-spacing: -0.02em;
}
.route {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0;
}
.rail .a,
.rail .b {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--ink);
}
.rail .b {
  border-radius: 2px;
  background: var(--ink);
  box-shadow: none;
}
.rail .line {
  flex: 1;
  width: 2px;
  background: var(--line);
  margin: 4px 0;
}
.fields {
  flex: 1;
  min-width: 0;
}
.place {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  padding: 8px 40px 8px 0;
  color: var(--ink);
}
.place + .place {
  border-top: 1px solid var(--line);
}
.place small {
  display: block;
  color: var(--slate);
  font-size: var(--t-xs);
}
.place span {
  display: block;
  font: 600 var(--t-md) var(--font-display);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.place .ph {
  color: var(--slate-faint);
}
.swap {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  font-size: 18px;
  display: grid;
  place-items: center;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.between {
  justify-content: space-between;
}
.step {
  display: flex;
  align-items: center;
  gap: 14px;
}
.step button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 20px;
}
.step button:disabled {
  opacity: 0.4;
}
.goods {
  margin-top: 8px;
}
.trip {
  margin: 0;
}
.opts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opts li {
  animation: rise-in 0.35s var(--ease) calc(var(--n) * 50ms) both;
}
.opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px 14px;
  border: 2px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--ink);
  transition: border-color var(--dur-2), transform var(--dur-1), background var(--dur-2);
}
.opt:active:not(:disabled) {
  transform: scale(0.985);
}
.opt.on {
  border-color: var(--ink);
  background: var(--ink-wash);
}
.opt:disabled {
  opacity: 0.5;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.info strong {
  font: 700 var(--t-md) var(--font-display);
}
.info small {
  color: var(--slate);
  font-size: var(--t-xs);
}
.fare {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.fare b {
  font: 700 var(--t-lg) var(--font-display);
}
.fare em {
  font-style: normal;
  font-size: var(--t-xs);
  color: var(--warn);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
}
.sk {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sk .skeleton {
  height: 70px;
  border-radius: 16px;
}
.pay {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pay button {
  height: 48px;
  border-radius: 14px;
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font: 600 var(--t-md) var(--font-display);
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}
.pay button[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--ink-wash);
}
.promo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  height: 48px;
  border: 1.5px dashed var(--line);
  border-radius: 14px;
  color: var(--slate);
}
.promo input {
  flex: 1;
  border: 0;
  outline: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-transform: uppercase;
  min-width: 0;
}
.go {
  position: sticky;
  bottom: 0;
}
.center {
  text-align: center;
  margin: 0;
}
@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
