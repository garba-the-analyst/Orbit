<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import { naira, when } from '../../lib/format';
import { FULFILMENT_LABEL, shortStatus } from '../../lib/status';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';

const orders = ref<OrderView[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

async function load() {
  error.value = '';
  try {
    orders.value = await api.admin.orders();
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

async function unlock(o: OrderView) {
  const ok = await confirmAction({
    title: 'Unlock PIN entry?',
    message: `Only do this after you have confirmed the customer for ${o.waybillNo}. The wrong-attempt counter resets.`,
    confirm: 'Unlock PIN entry',
    cancel: 'Leave locked',
  });
  if (!ok) return;
  busyId.value = o.id;
  try {
    await api.admin.unlockPin(o.id);
    toast('PIN entry unlocked.');
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
        <h1 class="title">All orders</h1>
        <p class="lede">The latest 50 orders across ORBIT, for support and disputes.</p>

        <ListSkeleton v-if="loading" :rows="4" :sign="false" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState v-else-if="orders.length === 0" title="No orders yet" text="Orders from every shop appear here as they are placed." />

        <ul v-else class="list">
          <li v-for="o in orders" :key="o.id" style="padding: 16px 0">
            <div class="row between">
              <span class="strong num">{{ o.waybillNo }}</span>
              <span class="money">{{ naira(o.total) }}</span>
            </div>
            <div class="small">{{ o.shop.name }} · {{ o.customer?.name }}</div>
            <div class="row between" style="margin-top: 6px">
              <span class="status" :class="shortStatus(o).tone === 'ink' ? '' : shortStatus(o).tone">{{ shortStatus(o).text }}</span>
              <span class="xsmall muted">{{ FULFILMENT_LABEL[o.fulfilment] }} · {{ when(o.timeline.createdAt) }}</span>
            </div>
            <div v-if="o.courier" class="xsmall muted" style="margin-top: 4px">Rider: {{ o.courier.name }}</div>
            <div v-if="o.pinLocked" class="notice bad" style="margin-top: 10px">
              PIN entry is locked after too many wrong tries.
              <button class="btn btn-bad small-btn" style="margin-top: 10px" :disabled="busyId === o.id" @click="unlock(o)">Unlock PIN entry</button>
            </div>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>
