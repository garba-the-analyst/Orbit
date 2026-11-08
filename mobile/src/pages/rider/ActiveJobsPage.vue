<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import PinSheet from '../../components/PinSheet.vue';
import ShopSign from '../../components/ShopSign.vue';
import { clock, minutesUntil, naira, plural, when } from '../../lib/format';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const router = useRouter();
const badges = useBadges();

const jobs = ref<OrderView[]>([]);
const history = ref<OrderView[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

async function load() {
  error.value = '';
  try {
    const [active, done] = await Promise.all([api.rider.active(), api.rider.history()]);
    jobs.value = active;
    history.value = done.slice(0, 10);
    badges.riderActive = active.length;
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

async function pickUp(j: OrderView) {
  busyId.value = j.id;
  try {
    await api.rider.pickup(j.id);
    toast('Collected. Head to the customer.');
    await load();
  } catch (e) {
    await showError(e);
    load();
  } finally {
    busyId.value = null;
  }
}

async function giveBack(j: OrderView) {
  const ok = await confirmAction({
    title: 'Give this job back?',
    message: 'It returns to the job board for other riders. Do this only before you have collected it.',
    confirm: 'Give job back',
    cancel: 'Keep job',
    destructive: true,
  });
  if (!ok) return;
  busyId.value = j.id;
  try {
    await api.rider.release(j.id);
    toast('Job given back.');
    await load();
  } catch (e) {
    await showError(e);
  } finally {
    busyId.value = null;
  }
}

// ---- PIN ---------------------------------------------------------------------------------------------
const pinJob = ref<OrderView | null>(null);
const pinBusy = ref(false);
const pinError = ref('');

function openPin(j: OrderView) {
  pinError.value = '';
  pinJob.value = j;
}
async function submitPin(pin: string) {
  const j = pinJob.value;
  if (!j) return;
  pinBusy.value = true;
  pinError.value = '';
  try {
    await api.rider.deliver(j.id, pin);
    pinJob.value = null;
    success();
    toast(`Delivered. ${naira(j.money.payout)} added to your earnings.`);
    await load();
  } catch (e) {
    pinError.value = errorMessage(e);
  } finally {
    pinBusy.value = false;
  }
}

const prepNote = (j: OrderView) => {
  const m = minutesUntil(j.estimatedReadyAt);
  return m ? `The shop expects to be ready in about ${m} min (by ${clock(j.estimatedReadyAt)}).` : 'The shop should be ready now.';
};
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Active</h1>

        <ListSkeleton v-if="loading" :rows="2" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState v-else-if="jobs.length === 0" title="No active jobs" text="Accept a job from the Jobs tab and it appears here with everything you need.">
          <button class="btn btn-primary" @click="router.push('/r/jobs')">See jobs</button>
        </EmptyState>

        <ul v-else class="jobs">
          <li v-for="j in jobs" :key="j.id" class="job">
            <div class="row" style="align-items: flex-start">
              <ShopSign :name="j.shop.name" :color="j.shop.color" :size="44" />
              <div class="grow">
                <div class="strong num">{{ j.waybillNo }}</div>
                <div class="small muted">{{ plural(j.itemCount, 'item') }}</div>
              </div>
              <div class="money pay">{{ naira(j.money.payout) }}</div>
            </div>

            <ol class="legs">
              <li :class="{ done: j.status === 'ON_THE_WAY' }">
                <span class="strong">Collect from {{ j.shop.name }}</span>
                <span class="small muted block">{{ j.shop.address }}</span>
                <span v-if="j.status === 'CONFIRMED'" class="small block" style="margin-top: 4px">Still preparing. {{ prepNote(j) }}</span>
                <span v-else-if="j.status === 'READY'" class="status good" style="margin-top: 4px">Packed and ready</span>
              </li>
              <li>
                <span class="strong">Deliver to {{ j.customer?.name }}</span>
                <span class="small muted block">{{ j.deliveryAddress }}<template v-if="j.deliveryNote"> · {{ j.deliveryNote }}</template></span>
                <a v-if="j.customer?.phone" class="small strong call" :href="`tel:${j.customer.phone}`">Call {{ j.customer.phone }}</a>
              </li>
            </ol>

            <div class="actions">
              <button v-if="j.status === 'READY'" class="btn btn-primary block" :disabled="busyId === j.id" @click="pickUp(j)">I have collected the order</button>
              <button v-else-if="j.status === 'ON_THE_WAY'" class="btn btn-primary block" @click="openPin(j)">Complete delivery with PIN</button>
              <p v-else class="notice" style="margin: 0">You will be able to collect once the shop marks it packed.</p>
              <button v-if="j.status !== 'ON_THE_WAY'" class="btn btn-text block" :disabled="busyId === j.id" @click="giveBack(j)">Give job back</button>
            </div>
          </li>
        </ul>

        <section v-if="!loading && !error && history.length" style="margin-top: 36px" aria-label="Recent deliveries">
          <h2 class="heading">Recent deliveries</h2>
          <ul class="list">
            <li v-for="h in history" :key="h.id" class="row between">
              <span>
                <span class="strong block num">{{ h.waybillNo }}</span>
                <span class="small muted">{{ h.shop.name }} · {{ when(h.timeline.deliveredAt) }}</span>
              </span>
              <span class="money good">+{{ naira(h.money.payout) }}</span>
            </li>
          </ul>
        </section>
      </main>

      <PinSheet
        :open="!!pinJob"
        title="Enter the customer’s PIN"
        :subtitle="`Order ${pinJob?.waybillNo ?? ''}. Ask the customer for the 4 digits once you have handed over the order.`"
        confirm="Confirm delivery"
        :busy="pinBusy"
        :error="pinError"
        @close="pinJob = null"
        @submit="submitPin"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.jobs {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.job {
  padding: 20px 0;
  border-bottom: 1px solid var(--line);
}
.pay {
  font-size: var(--t-xl);
  color: var(--good);
}
.legs {
  list-style: none;
  margin: 18px 0 0;
  padding: 0 0 0 4px;
}
.legs li {
  position: relative;
  padding: 0 0 18px 26px;
}
.legs li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--paper);
  box-shadow: inset 0 0 0 2.5px var(--ink);
}
.legs li:first-child::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 18px;
  bottom: 2px;
  width: 2px;
  background: var(--line);
}
.legs li:last-child {
  padding-bottom: 0;
}
.legs li:last-child::before {
  background: var(--signal);
}
.legs li.done::before {
  background: var(--ink);
}
.block {
  display: block;
}
.call {
  display: inline-block;
  margin-top: 6px;
  padding: 6px 0;
  color: var(--ink);
  text-underline-offset: 3px;
}
.actions {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
