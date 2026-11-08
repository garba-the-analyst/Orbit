<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { OrderView } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import OrderRow from '../../components/OrderRow.vue';
import { isActive } from '../../lib/status';
import { errorMessage } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const router = useRouter();
const badges = useBadges();

const orders = ref<OrderView[]>([]);
const loading = ref(true);
const error = ref('');
const tab = ref<'active' | 'past'>('active');

async function load() {
  error.value = '';
  try {
    orders.value = await api.orders();
    badges.customerActive = orders.value.filter(isActive).length;
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

const active = computed(() => orders.value.filter(isActive));
const past = computed(() => orders.value.filter((o) => !isActive(o)));
const shown = computed(() => (tab.value === 'active' ? active.value : past.value));
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Your orders</h1>

        <div class="texttabs" role="tablist" aria-label="Order history" style="margin-top: 14px">
          <button class="texttab" role="tab" :aria-selected="tab === 'active'" @click="tab = 'active'">
            In progress<span v-if="active.length" class="count">{{ active.length }}</span>
          </button>
          <button class="texttab" role="tab" :aria-selected="tab === 'past'" @click="tab = 'past'">Past orders</button>
        </div>

        <ListSkeleton v-if="loading" :rows="3" />

        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}
          <button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <EmptyState
          v-else-if="shown.length === 0"
          :title="tab === 'active' ? 'Nothing on the way' : 'No past orders yet'"
          :text="tab === 'active' ? 'When you order, you can follow it here from the shop to your door.' : 'Delivered and cancelled orders appear here.'"
        >
          <button v-if="tab === 'active'" class="btn btn-primary" @click="router.push('/c/shops')">Browse shops</button>
        </EmptyState>

        <ul v-else class="list">
          <li v-for="o in shown" :key="o.id" style="padding: 0">
            <button class="rowlink" style="padding: 16px 0" @click="router.push(`/c/order/${o.id}`)">
              <OrderRow :order="o" />
            </button>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>
