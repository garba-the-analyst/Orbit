<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../api/endpoints';
import type { Product, Shop } from '../../api/types';
import BasketBar from '../../components/BasketBar.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import QtyStepper from '../../components/QtyStepper.vue';
import ShopSign from '../../components/ShopSign.vue';
import { naira } from '../../lib/format';
import { confirmAction, errorMessage } from '../../lib/ui';
import { useCart } from '../../stores/cart';

const route = useRoute();
const cart = useCart();

const shop = ref<Shop | null>(null);
const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  const id = route.params.id as string;
  if (!id) return;
  error.value = '';
  try {
    const res = await api.shop(id);
    shop.value = res.shop;
    products.value = res.products;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);

const shopSummary = (s: Shop) => ({
  id: s.id,
  name: s.name,
  color: s.color,
  isOpen: s.isOpen,
  prepMinutes: s.prepMinutes,
  offersDelivery: s.offersDelivery,
  deliveryFee: s.deliveryFee,
  address: s.address,
});

/** Changes a quantity. Adding from a different shop asks before replacing the current basket. */
async function change(p: Product, qty: number) {
  if (!shop.value) return;
  if (qty > cart.qtyOf(p.id) && cart.wouldReplace(shop.value.id)) {
    const ok = await confirmAction({
      title: 'Start a new basket?',
      message: `Your basket has items from ${cart.shop?.name}. An order can only come from one shop.`,
      confirm: `Start basket with ${shop.value.name}`,
      cancel: 'Keep my basket',
    });
    if (!ok) return;
    cart.clear();
  }
  cart.setQty(shopSummary(shop.value), { id: p.id, name: p.name, price: p.price, stock: p.stock }, qty);
}
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/c/shops" text="" /></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <main class="screen" style="padding-bottom: 120px">
        <ListSkeleton v-if="loading" :rows="5" />

        <div v-else-if="error" class="notice bad" role="alert">
          {{ error }}
          <button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="shop">
          <header class="head">
            <ShopSign :name="shop.name" :color="shop.color" :size="64" />
            <div class="grow">
              <h1 class="title-sm" style="margin: 0">{{ shop.name }}</h1>
              <p class="small muted" style="margin: 4px 0 0">{{ shop.description }}</p>
            </div>
          </header>

          <div class="facts">
            <span class="status" :class="shop.isOpen ? 'good' : 'warn'">{{ shop.isOpen ? 'Open now' : 'Closed right now' }}</span>
            <span class="small">Ready in about {{ shop.prepMinutes }} min</span>
            <span v-if="shop.rating !== null" class="small num">★ {{ shop.rating.toFixed(1) }} ({{ shop.ratingCount }})</span>
          </div>
          <p class="small muted" style="margin: 10px 0 0">{{ shop.address }}</p>

          <section class="how" aria-label="Ways to get your order">
            <h2 class="heading">Ways to get your order</h2>
            <ul class="small">
              <li><span class="strong">Pick up</span> free</li>
              <li v-if="shop.offersDelivery"><span class="strong">Shop delivers</span> {{ naira(shop.deliveryFee) }}</li>
              <li><span class="strong">ORBIT rider</span> from ₦700</li>
            </ul>
          </section>

          <div v-if="!shop.isOpen" class="notice warn" style="margin-top: 16px">
            This shop is closed, so it is not taking orders. You can still look at the menu.
          </div>

          <h2 class="heading" style="margin-top: 28px">Menu</h2>
          <ul class="list">
            <li v-for="p in products" :key="p.id" class="prod" :class="{ out: p.soldOut }">
              <div class="grow">
                <div class="pname">{{ p.name }}</div>
                <div v-if="p.description" class="small muted">{{ p.description }}</div>
                <div class="money price">{{ naira(p.price) }}</div>
              </div>
              <span v-if="p.soldOut" class="status warn">Sold out</span>
              <QtyStepper v-else-if="shop.isOpen" :qty="cart.qtyOf(p.id)" :max="Math.min(p.stock, cart.MAX_QTY)" :label="p.name" @change="change(p, $event)" />
            </li>
          </ul>
        </template>
      </main>
      <BasketBar />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.head {
  display: flex;
  gap: 16px;
  align-items: center;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: center;
  margin-top: 16px;
}
.how {
  margin-top: 22px;
  padding: 16px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.how ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.how li {
  padding: 3px 0;
  display: flex;
  justify-content: space-between;
}
.prod {
  display: flex !important;
  gap: 14px;
  align-items: center;
}
.prod.out .pname,
.prod.out .price {
  color: var(--slate-faint);
}
.pname {
  font: 600 var(--t-md) / 1.3 var(--font-display);
  letter-spacing: -0.01em;
}
.price {
  margin-top: 4px;
  font-size: var(--t-md);
}
</style>
