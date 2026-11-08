<script setup lang="ts">
/** Earnings for merchants and riders, from the settlement ledger. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { EarningsSummary } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import { naira, plural, weekday, when } from '../../lib/format';
import { errorMessage } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';
import { useAuth } from '../../stores/auth';

const auth = useAuth();
const cfg = useAppConfig();
const data = ref<EarningsSummary | null>(null);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    data.value = auth.role === 'RIDER' ? await api.rider.earnings() : await api.merchant.earnings();
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

const KIND: Record<string, string> = {
  SALE_NET: 'Sale',
  MERCHANT_DELIVERY_FEE: 'Delivery fee',
  DELIVERY_PAYOUT: 'Delivery',
};

/** Bar chart geometry: bars scale to the busiest day; an empty week still draws a baseline. */
const max = computed(() => Math.max(1, ...(data.value?.last7Days.map((d) => d.amount) ?? [0])));
const bars = computed(() =>
  (data.value?.last7Days ?? []).map((d, i, all) => ({ ...d, h: Math.round((d.amount / max.value) * 100), isToday: i === all.length - 1, label: weekday(d.date) })),
);
const weekTotal = computed(() => bars.value.reduce((s, b) => s + b.amount, 0));
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Earnings</h1>

        <div v-if="loading" class="skeleton" style="height: 180px; margin-top: 16px" role="status" aria-label="Loading"></div>
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 16px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="data">
          <section class="total" aria-label="Total earned">
            <div class="small muted">Earned so far</div>
            <div class="money big">{{ naira(data.total) }}</div>
            <div class="small muted">from {{ plural(data.ordersSettled, auth.role === 'RIDER' ? 'delivery' : 'order').replace('deliverys', 'deliveries') }} · {{ naira(data.today) }} today</div>
          </section>

          <section v-if="data.ordersSettled > 0" aria-label="Last 7 days">
            <div class="row between">
              <h2 class="heading">Last 7 days</h2>
              <span class="small muted money">{{ naira(weekTotal) }}</span>
            </div>
            <div class="chart" role="img" :aria-label="`Earnings over the last 7 days: ${bars.map((b) => `${b.label} ${naira(b.amount)}`).join(', ')}`">
              <div v-for="b in bars" :key="b.date" class="col">
                <div class="val xsmall num">{{ b.amount ? naira(b.amount).replace('₦', '') : '' }}</div>
                <div class="bar" :class="{ today: b.isToday }" :style="{ height: `${Math.max(b.h, b.amount ? 6 : 2)}%` }"></div>
                <div class="day xsmall" :class="{ strong: b.isToday }">{{ b.label }}</div>
              </div>
            </div>
          </section>

          <section aria-label="Recent earnings" style="margin-top: 28px">
            <h2 class="heading">Recent</h2>
            <EmptyState v-if="data.recent.length === 0" title="Nothing earned yet" :text="auth.role === 'RIDER' ? 'Accept a job and complete it with the customer’s PIN. It appears here straight away.' : 'Once an order is handed over with the customer’s PIN, your earnings appear here.'" />
            <ul v-else class="list">
              <li v-for="(r, i) in data.recent" :key="r.orderId + r.kind + i" class="row between">
                <span>
                  <span class="strong block num">{{ r.waybillNo }}</span>
                  <span class="small muted">{{ KIND[r.kind] ?? 'Earning' }} · {{ when(r.at) }}</span>
                </span>
                <span class="money good">+{{ naira(r.amount) }}</span>
              </li>
            </ul>
          </section>

          <p class="notice" style="margin-top: 24px">
            <template v-if="auth.role === 'MERCHANT'">Sales are shown after ORBIT’s {{ cfg.config.commissionPct }}% commission. </template>
            This is what ORBIT owes you from completed orders. Bank payouts are not part of this version of the app.
          </p>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.total {
  margin: 12px 0 28px;
}
.big {
  font-size: 3rem;
  line-height: 1.05;
  letter-spacing: -0.035em;
  margin: 2px 0 6px;
}
.chart {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  height: 168px;
  margin-top: 16px;
  padding-bottom: 2px;
}
.col {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  min-width: 0;
}
.bar {
  background: var(--ink);
  border-radius: 6px 6px 2px 2px;
  min-height: 2px;
  transition: height 0.5s ease;
}
.bar.today {
  background: var(--signal);
  box-shadow: inset 0 0 0 2px var(--ink);
}
.val {
  text-align: center;
  color: var(--slate);
  height: 18px;
  overflow: hidden;
  margin-bottom: 4px;
}
.day {
  text-align: center;
  margin-top: 8px;
  color: var(--slate);
}
.day.strong {
  color: var(--ink);
}
.block {
  display: block;
}
</style>
