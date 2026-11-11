<script setup lang="ts">
/** The customer hub: book a ride, send a parcel, move freight or shop, with anything in progress on top. */
import { IonContent, IonIcon, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { bagHandleOutline, chevronForwardOutline, searchOutline } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView, Shop, TripView } from '../../api/types';
import BellButton from '../../components/BellButton.vue';
import OrbitMark from '../../components/OrbitMark.vue';
import ShopSign from '../../components/ShopSign.vue';
import Skeleton from '../../components/Skeleton.vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { firstName, money } from '../../lib/format';
import { currentPosition } from '../../lib/geo';
import { isActive, trackerTitle } from '../../lib/status';
import { autoTour } from '../../lib/tour';
import { useAuth } from '../../stores/auth';
import { useBadges } from '../../stores/badges';

const router = useRouter();
const auth = useAuth();
const badges = useBadges();

const trip = ref<TripView | null>(null);
const orders = ref<OrderView[]>([]);
const shops = ref<Shop[]>([]);
const loading = ref(true);

const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
});

async function load() {
  const fix = await currentPosition(2500);
  const [t, o, s] = await Promise.all([
    api.activeTrip().catch(() => null),
    api.orders().catch(() => [] as OrderView[]),
    api.shops({ limit: 8, ...(fix ? { lat: fix.lat, lng: fix.lng, sort: 'distance' as const } : { sort: 'rating' as const }) })
      .then((r) => (r.items.length || !fix ? r : api.shops({ limit: 8, sort: 'rating' })))
      .catch(() => ({ items: [] as Shop[], total: 0 })),
  ]);
  trip.value = t && !('none' in t) ? t : null;
  orders.value = o.filter(isActive);
  badges.customerActive = orders.value.length + (trip.value ? 1 : 0);
  shops.value = s.items;
  loading.value = false;
}

onIonViewWillEnter(() => {
  load();
  autoTour(auth.role === 'MERCHANT' ? 'merchant' : 'customer');
});
useLive(['trip.updated', 'order.updated', 'connect'], load);

async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const services = [
  { key: 'ride', title: 'Ride', sub: 'Bike, keke or car', vehicle: 'CAR', tour: 'book-ride' },
  { key: 'parcel', title: 'Parcel', sub: 'Send anything', vehicle: 'MOTORCYCLE', tour: 'book-parcel' },
  { key: 'freight', title: 'Freight', sub: 'Vans and trucks', vehicle: 'TRUCK', tour: 'book-freight' },
];
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen home">
        <header class="top">
          <div class="brand"><OrbitMark :size="34" animate="orbit" /></div>
          <div class="grow">
            <small class="muted">{{ greeting }}</small>
            <h1>{{ firstName(auth.user?.name ?? '') }}</h1>
          </div>
          <ThemeToggle />
          <BellButton />
        </header>

        <button class="where" type="button" @click="router.push('/c/book/ride')">
          <ion-icon :icon="searchOutline" />
          <span>Where to?</span>
        </button>

        <!-- Something in progress comes first. -->
        <button v-if="trip" class="live" type="button" @click="router.push(`/c/trip/${trip.id}`)">
          <span class="pulse"></span>
          <span class="grow left"><strong>{{ trip.kind === 'RIDE' ? 'Ride' : 'Parcel' }} in progress</strong><small>{{ trip.status === 'SEARCHING' ? 'Finding a driver…' : trip.status === 'IN_PROGRESS' ? 'On the way' : 'Driver assigned' }} · {{ trip.drop.address }}</small></span>
          <ion-icon :icon="chevronForwardOutline" />
        </button>
        <button v-for="o in orders.slice(0, 2)" :key="o.id" class="live" type="button" @click="router.push(`/c/order/${o.id}`)">
          <span class="pulse"></span>
          <span class="grow left"><strong>{{ o.shop.name }}</strong><small>{{ trackerTitle(o) }} · {{ money(o.total, o.currency) }}</small></span>
          <ion-icon :icon="chevronForwardOutline" />
        </button>

        <section class="grid" aria-label="Services">
          <button v-for="(s, i) in services" :key="s.key" type="button" class="svc" :style="{ '--n': i }" :data-tour="s.tour" @click="router.push(`/c/book/${s.key}`)">
            <VehicleIcon :type="s.vehicle" :size="56" />
            <strong>{{ s.title }}</strong>
            <small>{{ s.sub }}</small>
          </button>
          <button type="button" class="svc shop" style="--n: 3" data-tour="shops" @click="router.push('/c/shops')">
            <ion-icon :icon="bagHandleOutline" class="big" />
            <strong>Shops</strong>
            <small>Order and deliver</small>
          </button>
        </section>

        <section>
          <div class="row between head"><h2>Shops for you</h2><button class="btn-text" type="button" @click="router.push('/c/shops')">See all</button></div>
          <Skeleton v-if="loading" kind="cards" :count="2" />
          <div v-else class="hscroll">
            <button v-for="s in shops" :key="s.id" class="shopcard" type="button" @click="router.push(`/c/shop/${s.id}`)">
              <img v-if="s.coverUrl" :src="s.coverUrl" :alt="s.name" loading="lazy" />
              <ShopSign v-else :name="s.name" :color="s.color" :size="64" />
              <strong>{{ s.name }}</strong>
              <small class="muted">{{ s.category }}<template v-if="s.distanceKm != null"> · {{ s.distanceKm.toFixed(1) }} km</template></small>
            </button>
            <p v-if="!shops.length" class="muted small">No shops listed yet.</p>
          </div>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 32px;
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}
h1 {
  margin: 0;
  font: 700 var(--t-xl) var(--font-display);
  letter-spacing: -0.02em;
}
h2 {
  margin: 0;
  font: 700 var(--t-lg) var(--font-display);
}
.where {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 18px;
  border: 0;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 0 0 1.5px var(--line), var(--shadow-sm);
  color: var(--slate);
  font: 600 var(--t-lg) var(--font-display);
  text-align: left;
}
.where ion-icon {
  font-size: 22px;
  color: var(--ink);
}
.live {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 0;
  border-radius: 16px;
  background: var(--ink);
  color: var(--on-ink);
  animation: rise 0.4s var(--ease) both;
}
.live .left {
  display: flex;
  flex-direction: column;
  text-align: left;
  min-width: 0;
}
.live small {
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--signal);
  animation: beat 1.4s ease-out infinite;
}
@keyframes beat {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 196, 0, 0.7);
  }
  100% {
    box-shadow: 0 0 0 12px rgba(255, 196, 0, 0);
  }
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.svc {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  box-shadow: var(--shadow-sm);
  animation: rise 0.45s var(--ease) calc(var(--n) * 70ms) both;
  transition: transform var(--dur-1) var(--ease);
}
.svc:active {
  transform: scale(0.96);
}
.svc strong {
  margin-top: 8px;
  font: 700 var(--t-lg) var(--font-display);
}
.svc small {
  color: var(--slate);
}
.svc.shop {
  background: var(--signal);
  border-color: var(--signal);
  color: var(--on-signal);
}
.svc.shop small {
  color: var(--on-signal);
  opacity: 0.75;
}
.big {
  font-size: 48px;
}
.head {
  margin-bottom: 10px;
}
.hscroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  margin: 0 calc(var(--gutter) * -1);
  padding: 2px var(--gutter) 8px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.hscroll::-webkit-scrollbar {
  display: none;
}
.shopcard {
  flex: none;
  width: 150px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  border: 0;
  background: none;
  color: var(--ink);
}
.shopcard img {
  width: 150px;
  height: 100px;
  object-fit: cover;
  border-radius: 14px;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
