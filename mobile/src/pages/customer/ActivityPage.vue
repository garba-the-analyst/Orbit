<script setup lang="ts">
/** Everything you have booked: shop orders and trips, in progress and past. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView, TripView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import OrderRow from '../../components/OrderRow.vue';
import Skeleton from '../../components/Skeleton.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { distance, money, when } from '../../lib/format';
import { isActive } from '../../lib/status';
import { errorMessage } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const router = useRouter();
const badges = useBadges();

const orders = ref<OrderView[]>([]);
const trips = ref<TripView[]>([]);
const tripTotal = ref(0);
const loading = ref(true);
const error = ref('');
const tab = ref<'active' | 'past'>('active');
const more = ref(false);

const TRIP_ACTIVE = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];

async function load() {
  error.value = '';
  try {
    const [o, t] = await Promise.all([api.orders(), api.trips('active', 50).then(async (a) => ({ a, p: await api.trips('past', 20) }))]);
    orders.value = o;
    trips.value = [...t.a.items, ...t.p.items];
    tripTotal.value = t.p.total;
    badges.customerActive = o.filter(isActive).length + t.a.items.length;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['order.updated', 'trip.updated'], load);

async function loadMore() {
  more.value = true;
  try {
    const page = await api.trips('past', 20, trips.value.filter((t) => !TRIP_ACTIVE.includes(t.status)).length);
    trips.value = [...trips.value, ...page.items];
  } finally {
    more.value = false;
  }
}

async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

type Item = { kind: 'order'; at: string; order: OrderView } | { kind: 'trip'; at: string; trip: TripView };
const items = computed<Item[]>(() => {
  const isAct = tab.value === 'active';
  const o: Item[] = orders.value.filter((x) => isActive(x) === isAct).map((order) => ({ kind: 'order', at: order.timeline.createdAt, order }));
  const t: Item[] = trips.value.filter((x) => TRIP_ACTIVE.includes(x.status) === isAct).map((trip) => ({ kind: 'trip', at: trip.times.requestedAt ?? '', trip }));
  return [...o, ...t].sort((a, b) => b.at.localeCompare(a.at));
});
const activeCount = computed(() => orders.value.filter(isActive).length + trips.value.filter((t) => TRIP_ACTIVE.includes(t.status)).length);

const tone = (s: string) => (s === 'COMPLETED' ? 'good' : s === 'CANCELLED' || s === 'NO_DRIVER' ? 'bad' : '');
const label = (s: string) => ({ SEARCHING: 'Finding driver', ACCEPTED: 'Driver on the way', ARRIVED: 'Driver arrived', IN_PROGRESS: 'On the way', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_DRIVER: 'No driver' })[s] ?? s;
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen">
        <h1 class="title">Activity</h1>
        <div class="texttabs" role="tablist" aria-label="Activity" style="margin-top: 14px">
          <button class="texttab" role="tab" :aria-selected="tab === 'active'" @click="tab = 'active'">In progress<span v-if="activeCount" class="count">{{ activeCount }}</span></button>
          <button class="texttab" role="tab" :aria-selected="tab === 'past'" @click="tab = 'past'">History</button>
        </div>

        <Skeleton v-if="loading" kind="rows" :count="4" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!items.length" :title="tab === 'active' ? 'Nothing in progress' : 'No history yet'" :text="tab === 'active' ? 'Book a ride, send a parcel or order from a shop. It shows up here live.' : 'Finished rides, deliveries and orders appear here.'">
          <button v-if="tab === 'active'" class="btn btn-primary" @click="router.push('/c/home')">Go to home</button>
        </EmptyState>
        <ul v-else class="list">
          <li v-for="it in items" :key="`${it.kind}${it.kind === 'order' ? it.order.id : it.trip.id}`" style="padding: 0">
            <button v-if="it.kind === 'order'" class="rowlink" style="padding: 16px 0" @click="router.push(`/c/order/${it.order.id}`)"><OrderRow :order="it.order" /></button>
            <button v-else class="rowlink trip" @click="router.push(`/c/trip/${it.trip.id}`)">
              <span class="ico"><VehicleIcon :type="it.trip.vehicleType" :size="40" /></span>
              <span class="grow">
                <span class="row between"><strong>{{ it.trip.kind === 'RIDE' ? 'Ride' : 'Parcel' }} · {{ it.trip.vehicleLabel }}</strong><b class="money">{{ money(it.trip.price.total, it.trip.currency) }}</b></span>
                <span class="small muted line">{{ it.trip.pickup.address }} → {{ it.trip.drop.address }}</span>
                <span class="row between meta"><span class="status" :class="tone(it.trip.status)">{{ label(it.trip.status) }}</span><span class="xsmall muted">{{ distance(it.trip.distanceM) }} · {{ when(it.trip.times.requestedAt) }}</span></span>
              </span>
            </button>
          </li>
        </ul>
        <button v-if="tab === 'past' && trips.filter((t) => !TRIP_ACTIVE.includes(t.status)).length < tripTotal" class="btn btn-line" style="margin-top: 14px; width: 100%" :disabled="more" @click="loadMore">{{ more ? 'Loading…' : 'Load more trips' }}</button>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.trip {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px 0;
  width: 100%;
  text-align: left;
}
.ico {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--ink-wash);
  color: var(--ink);
  flex: none;
}
.line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin-top: 4px;
}
.trip .grow {
  min-width: 0;
}
</style>
