<script setup lang="ts">
/**
 * KPI snapshot from the business proposal (section 12): marketplace, logistics, financial.
 * Presented as a typographic table grouped by theme rather than a wall of identical tiles.
 */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { Kpis } from '../../api/types';
import { naira, when } from '../../lib/format';
import { errorMessage } from '../../lib/ui';

const k = ref<Kpis | null>(null);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    k.value = await api.admin.kpis();
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

const pct = (v: number | null) => (v === null ? 'No data yet' : `${v}%`);
const num = (v: number | null, unit = '') => (v === null ? 'No data yet' : `${v.toLocaleString('en-NG')}${unit}`);

interface Row { label: string; value: string; note?: string }
const sections = computed<Array<{ title: string; rows: Row[] }>>(() => {
  const d = k.value;
  if (!d) return [];
  return [
    {
      title: 'Marketplace',
      rows: [
        { label: 'Verified shops', value: num(d.marketplace.activeMerchants) },
        { label: 'Products listed', value: num(d.marketplace.listedProducts) },
        { label: 'Orders completed', value: num(d.marketplace.completedOrders), note: `${d.marketplace.openOrders} in progress now` },
        { label: 'Sales through ORBIT (GMV)', value: naira(d.marketplace.gmv), note: 'Merchant revenue, not ORBIT revenue' },
        { label: 'Average basket', value: d.marketplace.averageBasket === null ? 'No data yet' : naira(d.marketplace.averageBasket) },
        { label: 'Repeat buyers', value: pct(d.marketplace.repeatPurchaseRatePct), note: 'Customers with 2 or more completed orders' },
        { label: 'Refund rate', value: pct(d.marketplace.refundRatePct), note: 'Refunded payments out of all paid' },
      ],
    },
    {
      title: 'Logistics',
      rows: [
        { label: 'ORBIT rider deliveries', value: num(d.logistics.courierDeliveries) },
        { label: 'Average time to deliver', value: num(d.logistics.averageDeliveryMinutes, ' min'), note: 'From payment to PIN confirmation' },
        { label: 'Orders completed', value: pct(d.logistics.orderCompletionRatePct), note: 'Completed out of completed plus cancelled after payment' },
        { label: 'Verified riders', value: num(d.logistics.activeRiders), note: `${d.logistics.onlineRiders} online now` },
      ],
    },
    {
      title: 'Financial',
      rows: [
        { label: 'ORBIT revenue', value: naira(d.financial.platformRevenue), note: 'Commission plus delivery contribution' },
        { label: 'Marketplace commission', value: naira(d.financial.commission) },
        { label: 'Delivery contribution', value: naira(d.financial.deliveryContribution), note: 'Delivery fee less rider payout' },
        { label: 'Revenue per completed order', value: d.financial.contributionPerOrder === null ? 'No data yet' : naira(d.financial.contributionPerOrder) },
        { label: 'Owed to shops', value: naira(d.financial.owedToMerchants) },
        { label: 'Owed to riders', value: naira(d.financial.owedToRiders) },
      ],
    },
  ];
});
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Pilot numbers</h1>
        <p v-if="k" class="lede">Updated {{ when(k.generatedAt) }}. These come straight from completed orders, not estimates.</p>

        <div v-if="loading" class="skeleton" style="height: 260px; margin-top: 20px" role="status" aria-label="Loading"></div>
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="k">
          <section v-for="s in sections" :key="s.title" class="sec" :aria-label="s.title">
            <h2 class="heading">{{ s.title }}</h2>
            <dl>
              <div v-for="r in s.rows" :key="r.label" class="r">
                <dt>
                  <span>{{ r.label }}</span>
                  <span v-if="r.note" class="xsmall muted block">{{ r.note }}</span>
                </dt>
                <dd class="money" :class="{ none: r.value === 'No data yet' }">{{ r.value }}</dd>
              </div>
            </dl>
          </section>
          <p class="notice" style="margin-top: 28px">
            Demo data is fictional sample activity for course presentation. Replace it with real pilot results before drawing any conclusion about demand or unit economics.
          </p>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.sec {
  margin-top: 30px;
}
dl {
  margin: 8px 0 0;
}
.r {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
dt {
  font-size: var(--t-md);
  line-height: 1.35;
  min-width: 0;
}
dd {
  margin: 0;
  font-size: var(--t-lg);
  text-align: right;
}
dd.none {
  font-size: var(--t-sm);
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--slate-faint);
}
.block {
  display: block;
}
</style>
