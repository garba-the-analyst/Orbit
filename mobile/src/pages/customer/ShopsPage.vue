<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import { SHOP_CATEGORIES, type OrderView, type Shop } from '../../api/types';
import BasketBar from '../../components/BasketBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import ShopSign from '../../components/ShopSign.vue';
import { naira } from '../../lib/format';
import { errorMessage } from '../../lib/ui';
import { isActive, trackerTitle } from '../../lib/status';
import { useAppConfig } from '../../stores/appConfig';
import { useBadges } from '../../stores/badges';

const router = useRouter();
const cfg = useAppConfig();
const badges = useBadges();

const shops = ref<Shop[]>([]);
const activeOrders = ref<OrderView[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const category = ref<string>('All');

let seq = 0;
async function load() {
  const mine = ++seq; // ignore out-of-order responses while typing quickly
  error.value = '';
  try {
    const [list, orders] = await Promise.all([
      api.shops({ q: query.value.trim() || undefined, category: category.value === 'All' ? undefined : category.value }),
      api.orders().catch(() => [] as OrderView[]),
    ]);
    if (mine !== seq) return;
    shops.value = list;
    activeOrders.value = orders.filter(isActive);
    badges.customerActive = activeOrders.value.length;
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}

let debounce: ReturnType<typeof setTimeout>;
watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(load, 300);
});
watch(category, () => {
  loading.value = true;
  load();
});
onBeforeUnmount(() => clearTimeout(debounce));

onIonViewWillEnter(load);
useLive(['order.updated'], load);

async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const featured = computed(() => activeOrders.value[0] ?? null);
const meta = (s: Shop) => {
  const parts = [s.category, `ready in about ${s.prepMinutes} min`];
  if (s.offersDelivery) parts.push(`delivers for ${naira(s.deliveryFee)}`);
  return parts.join(', ');
};
const clear = () => {
  query.value = '';
  category.value = 'All';
};
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">Shops near campus</h1>
        <p class="lede">{{ cfg.config.pilotZone }}</p>

        <button v-if="featured" class="live" @click="router.push(`/c/order/${featured.id}`)">
          <span class="grow">
            <span class="strong">{{ featured.shop.name }}</span>
            <span class="small">{{ trackerTitle(featured) }}</span>
          </span>
          <span class="strong go">Track order</span>
        </button>

        <label class="field search">
          <span class="sr-only">Search shops and products</span>
          <input v-model="query" class="input" type="search" inputmode="search" enterkeyhint="search" placeholder="Search shops or products, like jollof" />
        </label>

        <div class="texttabs" role="tablist" aria-label="Shop category">
          <button v-for="c in ['All', ...SHOP_CATEGORIES]" :key="c" class="texttab" role="tab" :aria-selected="category === c" @click="category = c">
            {{ c }}
          </button>
        </div>

        <ListSkeleton v-if="loading" />

        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}
          <button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <EmptyState
          v-else-if="shops.length === 0"
          :title="query ? `No shops match “${query}”` : 'No shops here yet'"
          :text="query ? 'Check the spelling, try a shorter word, or clear the filter.' : 'New shops are verified by ORBIT before they appear. Check back soon.'"
        >
          <button v-if="query || category !== 'All'" class="btn btn-quiet" @click="clear">Clear search and filter</button>
        </EmptyState>

        <ul v-else class="list">
          <li v-for="s in shops" :key="s.id" style="padding: 0">
            <button class="shop" :class="{ closed: !s.isOpen }" @click="router.push(`/c/shop/${s.id}`)">
              <ShopSign :name="s.name" :color="s.color" />
              <span class="grow">
                <span class="row between">
                  <span class="sname">{{ s.name }}</span>
                  <span v-if="s.rating !== null" class="xsmall strong num" :aria-label="`Rated ${s.rating} out of 5`">★ {{ s.rating.toFixed(1) }}</span>
                </span>
                <span class="small muted block">{{ meta(s) }}</span>
                <span v-if="!s.isOpen" class="status warn" style="margin-top: 6px">Closed right now</span>
              </span>
            </button>
          </li>
        </ul>
      </main>
      <BasketBar above-tabs />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.live {
  appearance: none;
  border: 0;
  width: 100%;
  margin-top: 18px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  border-radius: var(--r-input);
  background: var(--ink);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.live .grow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.live .go {
  color: var(--signal);
  font-family: var(--font-display);
  font-size: var(--t-sm);
}
.search {
  margin-top: 18px;
  margin-bottom: 4px;
}
.shop {
  appearance: none;
  border: 0;
  background: none;
  width: 100%;
  padding: 16px 0;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
  border-bottom: 1px solid var(--line);
}
.shop.closed .sname,
.shop.closed :deep(.sign) {
  opacity: 0.6;
}
.sname {
  font: 600 var(--t-md) / 1.25 var(--font-display);
  letter-spacing: -0.01em;
}
.block {
  display: block;
  margin-top: 2px;
}
</style>
