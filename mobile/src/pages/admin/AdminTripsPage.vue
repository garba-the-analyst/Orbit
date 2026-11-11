<script setup lang="ts">
/** Every ride and parcel trip on the platform, filterable by status, with admin actions for stuck trips. */
import { IonContent, IonInfiniteScroll, IonInfiniteScrollContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { TripView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { distance, money, when } from '../../lib/format';
import { confirmAction, errorMessage, promptText, showError, toast } from '../../lib/ui';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'SEARCHING', label: 'Searching' },
  { id: 'IN_PROGRESS', label: 'On the road' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'NO_DRIVER', label: 'No driver' },
];
const status = ref('');
const trips = ref<TripView[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const PAGE = 30;

async function load(more = false) {
  error.value = '';
  try {
    const r = await api.admin.trips(status.value || undefined, PAGE, more ? trips.value.length : 0);
    trips.value = more ? [...trips.value, ...r.items] : r.items;
    total.value = r.total;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(() => load());
useLive(['trip.updated', 'admin.changed'], () => load());
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}
async function more(ev: CustomEvent) {
  await load(true);
  (ev.target as HTMLIonInfiniteScrollElement).complete();
}
function pick(id: string) {
  status.value = id;
  loading.value = true;
  load();
}

const live = (t: TripView) => ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status);
async function cancel(t: TripView) {
  const reason = await promptText({ title: `Cancel trip ${t.code}?`, message: 'Both people are told, and the customer pays nothing.', placeholder: 'Reason', confirm: 'Cancel trip' });
  if (!reason) return;
  try {
    await api.admin.cancelTrip(t.id, reason);
    toast('Trip cancelled.');
    load();
  } catch (e) {
    await showError(e);
  }
}
async function unlock(t: TripView) {
  if (!(await confirmAction({ title: 'Unlock the PIN?', message: 'This lets the driver try the PIN again.', confirm: 'Unlock', cancel: 'Leave locked' }))) return;
  try {
    await api.admin.unlockTrip(t.id);
    toast('PIN unlocked.');
    load();
  } catch (e) {
    await showError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title" data-tour="admin-trips">Trips</h1>
        <div class="chips" role="group" aria-label="Filter by status" style="margin-top: 12px">
          <button v-for="f in FILTERS" :key="f.id" class="chip" :aria-pressed="status === f.id" @click="pick(f.id)">{{ f.label }}</button>
        </div>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load()">Try again</button></div>
        <EmptyState v-else-if="!trips.length" title="No trips here" text="Trips appear as soon as customers book." />
        <ul v-else class="list">
          <li v-for="t in trips" :key="t.id" class="t">
            <div class="row between">
              <span><VehicleIcon :type="t.vehicleType" :size="20" /> <strong>{{ t.code }}</strong> · {{ t.kind.toLowerCase() }}</span>
              <span class="status" :class="t.status === 'COMPLETED' ? 'good' : ['CANCELLED', 'NO_DRIVER'].includes(t.status) ? 'bad' : 'warn'">{{ t.status.replace('_', ' ').toLowerCase() }}</span>
            </div>
            <div class="small">{{ t.pickup.address }} → {{ t.drop.address }}</div>
            <div class="xsmall muted">{{ distance(t.distanceM) }} · {{ money(t.price.total, t.currency) }} · {{ t.price.method.toLowerCase() }} · {{ when(t.times.requestedAt) }}</div>
            <div v-if="t.customer || t.driver" class="xsmall muted">{{ t.customer?.name }}<template v-if="t.driver"> → {{ t.driver.name }}</template></div>
            <div v-if="live(t) || t.pinLocked" class="btns">
              <button v-if="t.pinLocked" class="btn btn-line small-btn" @click="unlock(t)">Unlock PIN</button>
              <button v-if="live(t)" class="btn btn-bad small-btn" @click="cancel(t)">Cancel trip</button>
            </div>
          </li>
        </ul>
        <ion-infinite-scroll :disabled="trips.length >= total" @ionInfinite="more"><ion-infinite-scroll-content /></ion-infinite-scroll>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.t {
  padding: 14px 0;
  display: grid;
  gap: 4px;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
</style>
