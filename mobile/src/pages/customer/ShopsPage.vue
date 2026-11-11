<script setup lang="ts">
/** Browse shops anywhere ORBIT operates: search, category, nearest-first with your location, open now, favourites. */
import { IonContent, IonIcon, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { heart, heartOutline, locateOutline, star } from 'ionicons/icons';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { Shop } from '../../api/types';
import BasketBar from '../../components/BasketBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import ShopSign from '../../components/ShopSign.vue';
import Skeleton from '../../components/Skeleton.vue';
import { money } from '../../lib/format';
import { currentPosition } from '../../lib/geo';
import { errorMessage, showError, tap, toast } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';

const router = useRouter();
const cfg = useAppConfig();

const shops = ref<Shop[]>([]);
const total = ref(0);
const favs = ref<Set<string>>(new Set());
const cities = ref<Array<{ city: string; count?: number }>>([]);
const loading = ref(true);
const more = ref(false);
const error = ref('');
const query = ref('');
const category = ref('All');
const city = ref('');
const openNow = ref(false);
const near = ref<{ lat: number; lng: number } | null>(null);
const locating = ref(false);
const PAGE = 20;

const categories = computed(() => ['All', ...cfg.config.categories]);

function params(offset: number) {
  return {
    q: query.value.trim() || undefined,
    category: category.value === 'All' ? undefined : category.value,
    city: city.value || undefined,
    openNow: openNow.value || undefined,
    ...(near.value ? { lat: near.value.lat, lng: near.value.lng, sort: 'distance' as const } : {}),
    limit: PAGE,
    offset,
  };
}

let seq = 0;
async function load() {
  const mine = ++seq;
  error.value = '';
  try {
    const [page, ids] = await Promise.all([api.shops(params(0)), api.favouriteIds().catch(() => [] as string[])]);
    if (mine !== seq) return;
    shops.value = page.items;
    total.value = page.total;
    favs.value = new Set(ids);
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}
async function loadMore() {
  more.value = true;
  try {
    const page = await api.shops(params(shops.value.length));
    shops.value = [...shops.value, ...page.items];
    total.value = page.total;
  } catch (e) {
    showError(e);
  } finally {
    more.value = false;
  }
}

let debounce: ReturnType<typeof setTimeout>;
watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(load, 300);
});
watch([category, city, openNow, near], () => {
  loading.value = true;
  load();
});
onBeforeUnmount(() => clearTimeout(debounce));

onIonViewWillEnter(() => {
  load();
  api.cities().then((c) => (cities.value = c)).catch(() => undefined);
});
useLive(['order.updated'], load);

async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

async function toggleNear() {
  if (near.value) return (near.value = null);
  locating.value = true;
  const fix = await currentPosition();
  locating.value = false;
  if (!fix) return toast('Could not get your location. Allow location access to sort by distance.', 'error');
  near.value = { lat: fix.lat, lng: fix.lng };
  city.value = '';
}

async function toggleFav(s: Shop) {
  tap();
  const on = favs.value.has(s.id);
  const next = new Set(favs.value);
  on ? next.delete(s.id) : next.add(s.id);
  favs.value = next;
  try {
    await (on ? api.unfavourite(s.id) : api.favourite(s.id));
  } catch (e) {
    favs.value = new Set(favs.value.has(s.id) ? [...favs.value].filter((x) => x !== s.id) : [...favs.value, s.id]);
    showError(e);
  }
}

const meta = (s: Shop) => {
  const parts = [s.category];
  if (s.distanceKm != null) parts.push(`${s.distanceKm.toFixed(1)} km`);
  parts.push(`~${s.prepMinutes} min`);
  if (s.offersDelivery) parts.push(`delivers ${money(s.deliveryFee, s.currency)}`);
  return parts.join(' · ');
};
const clear = () => {
  query.value = '';
  category.value = 'All';
  city.value = '';
  openNow.value = false;
};
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <div class="row between">
          <h1 class="title">Shops</h1>
          <button class="btn-text" type="button" @click="router.push('/c/favourites')"><ion-icon :icon="heart" /> Saved</button>
        </div>
        <p class="lede">Across {{ cfg.config.serviceArea }}</p>

        <label class="field search">
          <span class="sr-only">Search shops and products</span>
          <input v-model="query" class="input" type="search" inputmode="search" enterkeyhint="search" placeholder="Search shops or products, like jollof" />
        </label>

        <div class="chips filters">
          <button type="button" class="chip" :aria-pressed="!!near" :disabled="locating" @click="toggleNear"><ion-icon :icon="locateOutline" /> {{ locating ? 'Locating…' : 'Near me' }}</button>
          <button type="button" class="chip" :aria-pressed="openNow" @click="openNow = !openNow">Open now</button>
          <button v-for="c in cities.slice(0, 8)" :key="c.city" type="button" class="chip" :aria-pressed="city === c.city" @click="city = city === c.city ? '' : c.city; near = null">{{ c.city }}</button>
        </div>

        <div class="texttabs" role="tablist" aria-label="Shop category">
          <button v-for="c in categories" :key="c" class="texttab" role="tab" :aria-selected="category === c" @click="category = c">{{ c }}</button>
        </div>

        <Skeleton v-if="loading" kind="cards" :count="4" style="margin-top: 18px" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!shops.length" :title="query ? `No shops match “${query}”` : 'No shops here yet'" :text="query ? 'Check the spelling, try a shorter word, or clear the filters.' : 'New shops are verified by ORBIT before they appear. Check back soon.'">
          <button v-if="query || category !== 'All' || city || openNow" class="btn btn-quiet" @click="clear">Clear search and filters</button>
        </EmptyState>

        <ul v-else class="grid">
          <li v-for="(s, i) in shops" :key="s.id" :style="{ '--n': i % PAGE }">
            <button class="shop" :class="{ closed: !s.isOpen }" @click="router.push(`/c/shop/${s.id}`)">
              <span class="cover">
                <img v-if="s.coverUrl" :src="s.coverUrl" :alt="s.name" loading="lazy" />
                <span v-else class="fallback" :style="{ background: s.color }"><ShopSign :name="s.name" :color="s.color" :size="56" /></span>
                <span v-if="!s.isOpen" class="badge">Closed</span>
              </span>
              <span class="sname">{{ s.name }}</span>
              <span class="small muted meta">{{ meta(s) }}</span>
              <span v-if="s.rating !== null" class="xsmall strong num"><ion-icon :icon="star" class="gold" /> {{ s.rating.toFixed(1) }} <span class="muted">({{ s.ratingCount }})</span></span>
            </button>
            <button class="heart" type="button" :aria-label="favs.has(s.id) ? 'Remove from saved' : 'Save shop'" :aria-pressed="favs.has(s.id)" @click="toggleFav(s)"><ion-icon :icon="favs.has(s.id) ? heart : heartOutline" /></button>
          </li>
        </ul>
        <button v-if="!loading && shops.length < total" class="btn btn-line" style="width: 100%; margin-top: 16px" :disabled="more" @click="loadMore">{{ more ? 'Loading…' : `Show more (${total - shops.length} left)` }}</button>
      </main>
      <BasketBar above-tabs />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.search {
  margin-top: 14px;
  margin-bottom: 4px;
}
.filters {
  margin: 10px 0 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.filters .chip {
  flex: none;
}
.grid {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 14px;
}
.grid li {
  position: relative;
  animation: rise 0.4s var(--ease) calc(var(--n) * 40ms) both;
}
.shop {
  appearance: none;
  border: 0;
  background: none;
  width: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: transform var(--dur-1) var(--ease);
}
.shop:active {
  transform: scale(0.97);
}
.cover {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 6px;
  background: var(--ink-wash);
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}
.shop.closed .cover {
  filter: grayscale(0.7);
  opacity: 0.8;
}
.badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 3px 9px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--on-ink);
  font: 700 var(--t-xs) var(--font-display);
}
.sname {
  font: 700 var(--t-md) / 1.25 var(--font-display);
  letter-spacing: -0.01em;
}
.meta {
  line-height: 1.35;
}
.gold {
  color: var(--signal);
  vertical-align: -2px;
}
.heart {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--ink);
  font-size: 20px;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
}
.heart[aria-pressed='true'] {
  color: var(--bad);
  animation: pop 0.35s var(--ease);
}
@keyframes pop {
  50% {
    transform: scale(1.3);
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
