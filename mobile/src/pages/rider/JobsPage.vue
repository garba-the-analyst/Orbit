<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import ShopSign from '../../components/ShopSign.vue';
import { minutesUntil, money, plural } from '../../lib/format';
import { errorMessage, showError, success, toast } from '../../lib/ui';
import { useAuth } from '../../stores/auth';
import { useBadges } from '../../stores/badges';
import { useAppConfig as useCfg } from '../../stores/appConfig';
const naira = (v: number) => money(v, useCfg().currency);

const auth = useAuth();
const router = useRouter();
const badges = useBadges();

const online = ref(auth.user?.online ?? false);
const jobs = ref<OrderView[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);
const switching = ref(false);

async function load() {
  error.value = '';
  try {
    const me = await auth.refresh();
    online.value = me.online;
    const [board, active] = await Promise.all([online.value ? api.rider.jobs() : Promise.resolve([]), api.rider.active()]);
    jobs.value = board;
    badges.riderJobs = board.length;
    badges.riderActive = active.length;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['jobs.changed', 'order.updated'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

async function setOnline(value: boolean) {
  switching.value = true;
  try {
    await api.rider.setOnline(value);
    online.value = value;
    toast(value ? 'You are online. New jobs appear here.' : 'You are offline.');
    await load();
  } catch (e) {
    online.value = !value;
    await showError(e);
  } finally {
    switching.value = false;
  }
}

async function claim(job: OrderView) {
  busyId.value = job.id;
  try {
    await api.rider.claim(job.id);
    success();
    toast('Job accepted. Details are on the Active tab.');
    await router.push('/r/active');
  } catch (e) {
    await showError(e); // e.g. "Another rider already took this job."
    load();
  } finally {
    busyId.value = null;
  }
}

/** How far along the shop is, so a rider can judge whether to head over now. */
function state(j: OrderView): string {
  if (j.status === 'READY') return 'Packed and waiting';
  const m = minutesUntil(j.estimatedReadyAt);
  return m ? `Ready in about ${m} min` : 'Ready any moment';
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Jobs</h1>

        <label class="status-card row between" :class="{ on: online }">
          <span>
            <span class="strong block">{{ online ? 'You are online' : 'You are offline' }}</span>
            <span class="small">{{ online ? 'You can see and accept jobs.' : 'Go online to see jobs near the shops.' }}</span>
          </span>
          <ion-toggle :checked="online" :disabled="switching" aria-label="Online" @ionChange="setOnline($event.detail.checked)" />
        </label>

        <ListSkeleton v-if="loading" :rows="3" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState v-else-if="!online" title="Go online to get jobs" text="While you are offline you will not see or receive any jobs." />
        <EmptyState v-else-if="jobs.length === 0" title="No jobs right now" text="New jobs show up here the moment a shop confirms an ORBIT rider order. Keep this screen open." />

        <template v-else>
          <p class="small muted" style="margin: 20px 0 0">{{ plural(jobs.length, 'job') }} waiting. Customer details are shown after you accept.</p>
          <ul class="list">
            <li v-for="j in jobs" :key="j.id" class="job" style="padding: 18px 0">
              <div class="row" style="align-items: flex-start">
                <ShopSign :name="j.shop.name" :color="j.shop.color" :size="48" />
                <div class="grow">
                  <div class="jn">{{ j.shop.name }}</div>
                  <div class="small muted">Collect at {{ j.shop.address }}</div>
                  <div class="small" style="margin-top: 4px">{{ plural(j.itemCount, 'item') }} · {{ state(j) }}</div>
                </div>
                <div class="pay">
                  <div class="money amt">{{ naira(j.money.payout) }}</div>
                  <div class="xsmall muted">you earn</div>
                </div>
              </div>
              <button class="btn btn-primary block" style="margin-top: 14px" :disabled="busyId === j.id" @click="claim(j)">
                {{ busyId === j.id ? 'Accepting…' : 'Accept job' }}
              </button>
            </li>
          </ul>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.status-card {
  margin-top: 16px;
  padding: 16px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.status-card.on {
  background: var(--good-wash);
  box-shadow: inset 0 0 0 1px var(--good);
}
.block {
  display: block;
}
.jn {
  font: 600 var(--t-md) / 1.25 var(--font-display);
  letter-spacing: -0.01em;
}
.pay {
  text-align: right;
  flex: none;
}
.amt {
  font-size: var(--t-xl);
  color: var(--good);
}
</style>
