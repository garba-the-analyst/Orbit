<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { VerificationQueue } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import { VEHICLE_LABEL, when } from '../../lib/format';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const badges = useBadges();
const queue = ref<VerificationQueue>({ merchants: [], riders: [] });
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

async function load() {
  error.value = '';
  try {
    queue.value = await api.admin.queue();
    badges.adminQueue = queue.value.merchants.length + queue.value.riders.length;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['admin.changed'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const total = computed(() => queue.value.merchants.length + queue.value.riders.length);

async function approve(userId: string, label: string) {
  busyId.value = userId;
  try {
    await api.admin.approve(userId);
    success();
    toast(`${label} approved. They can start right away.`);
    await load();
  } catch (e) {
    await showError(e);
    load();
  } finally {
    busyId.value = null;
  }
}

async function decline(userId: string, label: string) {
  const ok = await confirmAction({
    title: `Decline ${label}?`,
    message: 'Their account is suspended and they cannot sign in.',
    confirm: 'Decline and suspend',
    cancel: 'Keep in queue',
    destructive: true,
  });
  if (!ok) return;
  busyId.value = userId;
  try {
    await api.admin.suspend(userId);
    toast(`${label} declined.`);
    await load();
  } catch (e) {
    await showError(e);
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Verification</h1>
        <p class="lede">Shops and riders go live only after you approve them.</p>

        <ListSkeleton v-if="loading" :rows="3" :sign="false" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState v-else-if="total === 0" title="No one is waiting" text="New shops and riders appear here as soon as they sign up." />

        <template v-else>
          <section v-if="queue.merchants.length" aria-label="Shops waiting">
            <h2 class="heading" style="margin-top: 24px">Shops ({{ queue.merchants.length }})</h2>
            <ul class="list">
              <li v-for="m in queue.merchants" :key="m.userId" style="padding: 18px 0">
                <div class="strong name">{{ m.shop?.name ?? 'Shop' }}</div>
                <div class="small muted">{{ m.shop?.category }} · {{ m.shop?.address }}</div>
                <div class="small" style="margin-top: 8px">{{ m.name }} · <a :href="`tel:${m.phone}`" class="tel">{{ m.phone }}</a></div>
                <div class="xsmall muted">{{ m.email }} · signed up {{ when(m.createdAt) }}</div>
                <div class="btns">
                  <button class="btn btn-primary small-btn" :disabled="busyId === m.userId" @click="approve(m.userId, m.shop?.name ?? m.name)">Approve shop</button>
                  <button class="btn btn-bad small-btn" :disabled="busyId === m.userId" @click="decline(m.userId, m.shop?.name ?? m.name)">Decline</button>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="queue.riders.length" aria-label="Riders waiting">
            <h2 class="heading" style="margin-top: 24px">Riders ({{ queue.riders.length }})</h2>
            <ul class="list">
              <li v-for="r in queue.riders" :key="r.userId" style="padding: 18px 0">
                <div class="strong name">{{ r.name }}</div>
                <div class="small muted">{{ r.vehicle ? VEHICLE_LABEL[r.vehicle] : 'Vehicle not given' }}</div>
                <div class="small" style="margin-top: 8px"><a :href="`tel:${r.phone}`" class="tel">{{ r.phone }}</a></div>
                <div class="xsmall muted">{{ r.email }} · signed up {{ when(r.createdAt) }}</div>
                <div class="btns">
                  <button class="btn btn-primary small-btn" :disabled="busyId === r.userId" @click="approve(r.userId, r.name)">Approve rider</button>
                  <button class="btn btn-bad small-btn" :disabled="busyId === r.userId" @click="decline(r.userId, r.name)">Decline</button>
                </div>
              </li>
            </ul>
          </section>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.name {
  font: 600 var(--t-md) / 1.25 var(--font-display);
  letter-spacing: -0.01em;
}
.tel {
  color: var(--ink);
  text-underline-offset: 3px;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
</style>
