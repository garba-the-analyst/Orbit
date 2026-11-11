<script setup lang="ts">
/** A shop's page: cover, details, ways to get your order, and its catalogue of goods and services. */
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { callOutline, heart, heartOutline, navigateOutline, star, timeOutline } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { Product, Shop } from '../../api/types';
import BasketBar from '../../components/BasketBar.vue';
import GoodsTag from '../../components/GoodsTag.vue';
import QtyStepper from '../../components/QtyStepper.vue';
import ShopSign from '../../components/ShopSign.vue';
import Skeleton from '../../components/Skeleton.vue';
import { money } from '../../lib/format';
import { openNavigation } from '../../lib/geo';
import { confirmAction, errorMessage, showError, tap } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';
import { useCart } from '../../stores/cart';

const route = useRoute();
const router = useRouter();
const cart = useCart();
const cfg = useAppConfig();

const shop = ref<Shop | null>(null);
const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');
const fav = ref(false);
const filter = ref('ALL');

async function load() {
  const id = route.params.id as string;
  if (!id) return;
  error.value = '';
  try {
    const [res, ids] = await Promise.all([api.shop(id), api.favouriteIds().catch(() => [] as string[])]);
    shop.value = res.shop;
    products.value = res.products;
    fav.value = ids.includes(id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(() => {
  loading.value = !shop.value || shop.value.id !== route.params.id;
  load();
});

const kinds = computed(() => {
  const set = new Set(products.value.map((p) => (p.kind === 'SERVICE' ? 'SERVICE' : p.goodsType)));
  return ['ALL', ...set];
});
const shown = computed(() => (filter.value === 'ALL' ? products.value : products.value.filter((p) => (filter.value === 'SERVICE' ? p.kind === 'SERVICE' : p.kind !== 'SERVICE' && p.goodsType === filter.value))));
const kindLabel = (k: string) => (k === 'ALL' ? 'All' : k === 'SERVICE' ? 'Services' : (cfg.config.goods.find((g) => g.type === k)?.label ?? k));
const orbitFee = computed(() => cfg.config.markets.find((m) => m.currency === shop.value?.currency)?.orbitDeliveryFee ?? cfg.orbitDeliveryFee);

const shopSummary = (s: Shop) => ({ id: s.id, name: s.name, color: s.color, isOpen: s.isOpen, prepMinutes: s.prepMinutes, offersDelivery: s.offersDelivery, deliveryFee: s.deliveryFee, address: s.address, currency: s.currency });

/** Changes a quantity. Adding from a different shop asks before replacing the current basket. */
async function change(p: Product, qty: number) {
  if (!shop.value) return;
  if (qty > cart.qtyOf(p.id) && cart.wouldReplace(shop.value.id)) {
    const ok = await confirmAction({ title: 'Start a new basket?', message: `Your basket has items from ${cart.shop?.name}. An order can only come from one shop.`, confirm: `Start basket with ${shop.value.name}`, cancel: 'Keep my basket' });
    if (!ok) return;
    cart.clear();
  }
  cart.setQty(shopSummary(shop.value), { id: p.id, name: p.name, price: p.price, stock: p.stock }, qty);
}

async function toggleFav() {
  if (!shop.value) return;
  tap();
  const was = fav.value;
  fav.value = !was;
  try {
    await (was ? api.unfavourite(shop.value.id) : api.favourite(shop.value.id));
  } catch (e) {
    fav.value = was;
    showError(e);
  }
}
const open = (p: Product) => router.push({ path: `/c/product/${p.id}`, query: { shop: shop.value!.id } });
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/c/shops" text="" /></ion-buttons>
        <ion-buttons v-if="shop" slot="end">
          <button class="hb" type="button" :aria-pressed="fav" :aria-label="fav ? 'Remove from saved' : 'Save shop'" @click="toggleFav"><ion-icon :icon="fav ? heart : heartOutline" /></button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <main class="screen" style="padding-bottom: 120px">
        <Skeleton v-if="loading" kind="detail" />
        <div v-else-if="error" class="notice bad" role="alert">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>

        <template v-else-if="shop">
          <div class="cover" :style="{ background: shop.color }">
            <img v-if="shop.coverUrl" :src="shop.coverUrl" :alt="`${shop.name} cover`" />
          </div>
          <header class="head">
            <img v-if="shop.logoUrl" class="logo" :src="shop.logoUrl" :alt="shop.name" />
            <ShopSign v-else :name="shop.name" :color="shop.color" :size="64" />
            <div class="grow">
              <h1 class="title-sm" style="margin: 0">{{ shop.name }}</h1>
              <p class="small muted" style="margin: 2px 0 0">{{ shop.category }}<template v-if="shop.city"> · {{ shop.city }}</template></p>
            </div>
          </header>
          <p v-if="shop.description" class="muted" style="margin: 12px 0 0">{{ shop.description }}</p>

          <div class="facts">
            <span class="status" :class="shop.isOpen ? 'good' : 'warn'">{{ shop.isOpen ? 'Open now' : 'Closed right now' }}</span>
            <span class="small"><ion-icon :icon="timeOutline" /> ~{{ shop.prepMinutes }} min</span>
            <span v-if="shop.rating !== null" class="small num"><ion-icon :icon="star" class="gold" /> {{ shop.rating.toFixed(1) }} ({{ shop.ratingCount }})</span>
          </div>
          <p class="small muted" style="margin: 10px 0 0">{{ shop.address }}<template v-if="shop.openingHours"> · {{ shop.openingHours }}</template></p>
          <div class="acts">
            <button v-if="shop.lat != null && shop.lng != null" class="btn btn-line" type="button" @click="openNavigation({ lat: shop.lat!, lng: shop.lng! })"><ion-icon :icon="navigateOutline" />Directions</button>
            <a v-if="shop.phone" class="btn btn-line" :href="`tel:${shop.phone}`"><ion-icon :icon="callOutline" />Call</a>
          </div>

          <section class="how" aria-label="Ways to get your order">
            <h2 class="heading">Ways to get your order</h2>
            <ul class="small">
              <li><span class="strong">Pick up</span> free</li>
              <li v-if="shop.offersDelivery"><span class="strong">Shop’s own rider</span> {{ money(shop.deliveryFee, shop.currency) }}</li>
              <li><span class="strong">ORBIT rider</span> {{ money(orbitFee, shop.currency) }}</li>
            </ul>
          </section>

          <div v-if="!shop.isOpen" class="notice warn" style="margin-top: 16px">This shop is closed, so it is not taking orders. You can still look at the catalogue.</div>

          <h2 class="heading" style="margin-top: 28px">Catalogue</h2>
          <div v-if="kinds.length > 2" class="chips" style="margin-bottom: 8px">
            <button v-for="k in kinds" :key="k" type="button" class="chip" :aria-pressed="filter === k" @click="filter = k">{{ kindLabel(k) }}</button>
          </div>
          <p v-if="!products.length" class="muted">Nothing listed yet.</p>
          <ul class="list">
            <li v-for="p in shown" :key="p.id" class="prod" :class="{ out: p.soldOut }">
              <button class="pbtn" type="button" @click="open(p)">
                <img v-if="p.images[0]" :src="p.images[0]" :alt="p.name" loading="lazy" class="thumb" />
                <span v-else class="thumb ph" aria-hidden="true"></span>
                <span class="grow">
                  <span class="pname">{{ p.name }}</span>
                  <GoodsTag :type="p.goodsType" :kind="p.kind" />
                  <span v-if="p.description" class="small muted desc">{{ p.description }}</span>
                  <span class="money price">{{ money(p.price, shop.currency) }}<small v-if="p.unitLabel" class="muted"> / {{ p.unitLabel }}</small></span>
                </span>
              </button>
              <span v-if="p.soldOut" class="status warn">Sold out</span>
              <QtyStepper v-else-if="shop.isOpen && p.kind !== 'SERVICE'" :qty="cart.qtyOf(p.id)" :max="Math.min(p.stock, cart.MAX_QTY)" :label="p.name" @change="change(p, $event)" />
              <QtyStepper v-else-if="shop.isOpen" :qty="cart.qtyOf(p.id)" :max="Math.min(Math.max(p.stock, 1), cart.MAX_QTY)" :label="p.name" @change="change(p, $event)" />
            </li>
          </ul>
        </template>
      </main>
      <BasketBar />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.hb {
  width: 40px;
  height: 40px;
  border: 0;
  background: none;
  font-size: 24px;
  color: var(--ink);
}
.hb[aria-pressed='true'] {
  color: var(--bad);
}
.cover {
  height: 150px;
  margin: 0 calc(var(--gutter) * -1);
  overflow: hidden;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: -32px;
  position: relative;
}
.logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  border: 3px solid var(--paper);
  background: var(--surface);
}
.head .grow {
  padding-top: 32px;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: center;
  margin-top: 14px;
}
.gold {
  color: var(--signal);
  vertical-align: -2px;
}
.acts {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.acts .btn {
  flex: 1;
  gap: 8px;
  min-height: 44px;
}
.how ul {
  margin: 8px 0 0;
  padding-left: 18px;
}
.prod {
  display: flex !important;
  align-items: center;
  gap: 12px;
}
.prod.out {
  opacity: 0.55;
}
.pbtn {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
  border: 0;
  background: none;
  padding: 0;
  color: inherit;
}
.thumb {
  flex: none;
  width: 68px;
  height: 68px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--ink-wash);
}
.pbtn .grow {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
  min-width: 0;
}
.pname {
  font: 600 var(--t-md) / 1.3 var(--font-display);
}
.desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
