<script setup lang="ts">
/** Full product (or service) detail: photo carousel, description, size and weight, goods type, add to basket. */
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { Product, Shop } from '../../api/types';
import BasketBar from '../../components/BasketBar.vue';
import GoodsTag from '../../components/GoodsTag.vue';
import ImageCarousel from '../../components/ImageCarousel.vue';
import QtyStepper from '../../components/QtyStepper.vue';
import Skeleton from '../../components/Skeleton.vue';
import { money } from '../../lib/format';
import { confirmAction, errorMessage } from '../../lib/ui';
import { useAppConfig } from '../../stores/appConfig';
import { useCart } from '../../stores/cart';

const route = useRoute();
const router = useRouter();
const cart = useCart();
const cfg = useAppConfig();

const shop = ref<Shop | null>(null);
const product = ref<Product | null>(null);
const loading = ref(true);
const error = ref('');

onIonViewWillEnter(async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.shop(String(route.query.shop));
    shop.value = res.shop;
    product.value = res.products.find((p) => p.id === route.params.id) ?? null;
    if (!product.value) error.value = 'This item is no longer listed.';
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});

const size = computed(() => {
  const p = product.value;
  if (!p) return '';
  const dims = [p.lengthCm, p.widthCm, p.heightCm].every((v) => v) ? `${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm` : '';
  return [dims, p.weightKg ? `${p.weightKg} kg` : ''].filter(Boolean).join(' · ');
});
const handling = computed(() => cfg.config.goods.find((g) => g.type === product.value?.goodsType)?.handling);

async function change(qty: number) {
  const s = shop.value!;
  const p = product.value!;
  if (qty > cart.qtyOf(p.id) && cart.wouldReplace(s.id)) {
    const ok = await confirmAction({ title: 'Start a new basket?', message: `Your basket has items from ${cart.shop?.name}. An order can only come from one shop.`, confirm: `Start basket with ${s.name}`, cancel: 'Keep my basket' });
    if (!ok) return;
    cart.clear();
  }
  cart.setQty({ id: s.id, name: s.name, color: s.color, isOpen: s.isOpen, prepMinutes: s.prepMinutes, offersDelivery: s.offersDelivery, deliveryFee: s.deliveryFee, address: s.address, currency: s.currency }, { id: p.id, name: p.name, price: p.price, stock: p.stock }, qty);
}
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border"><ion-toolbar><ion-buttons slot="start"><ion-back-button default-href="/c/shops" text="" /></ion-buttons></ion-toolbar></ion-header>
    <ion-content :fullscreen="true">
      <main class="screen" style="padding-bottom: 120px">
        <Skeleton v-if="loading" kind="detail" />
        <div v-else-if="error" class="notice bad" role="alert">{{ error }}</div>
        <template v-else-if="product && shop">
          <ImageCarousel :images="product.images" :alt="product.name" class="car" />
          <div class="row between" style="margin-top: 16px; align-items: flex-start">
            <h1 class="title-sm" style="margin: 0">{{ product.name }}</h1>
            <b class="money big">{{ money(product.price, shop.currency) }}</b>
          </div>
          <p class="small muted" style="margin: 4px 0 0">{{ product.unitLabel ? `per ${product.unitLabel} · ` : '' }}<button class="btn-text inline" type="button" @click="router.push(`/c/shop/${shop.id}`)">{{ shop.name }}</button></p>
          <div class="tags"><GoodsTag :type="product.goodsType" :kind="product.kind" /><span v-if="product.soldOut" class="status warn">Sold out</span><span v-else-if="product.kind !== 'SERVICE' && product.stock <= 5" class="status warn">Only {{ product.stock }} left</span></div>
          <p v-if="product.description" class="desc">{{ product.description }}</p>
          <dl v-if="size || handling" class="specs">
            <template v-if="size"><dt>Size and weight</dt><dd>{{ size }}</dd></template>
            <template v-if="handling && product.kind !== 'SERVICE'"><dt>Handling</dt><dd>{{ handling }}</dd></template>
            <template v-if="product.kind === 'SERVICE'"><dt>Booking</dt><dd>Booked with the shop. Choose pickup or shop delivery at checkout.</dd></template>
          </dl>
          <div v-if="!product.soldOut && shop.isOpen" class="buy"><QtyStepper :qty="cart.qtyOf(product.id)" :max="Math.min(Math.max(product.stock, 1), cart.MAX_QTY)" :label="product.name" @change="change" /></div>
          <p v-else-if="!shop.isOpen" class="notice warn">This shop is closed right now.</p>
        </template>
      </main>
      <BasketBar />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.car {
  margin: 0 calc(var(--gutter) * -1);
  width: calc(100% + var(--gutter) * 2);
}
.big {
  font: 700 var(--t-xl) var(--font-display);
}
.inline {
  padding: 0;
  min-height: 0;
}
.tags {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.desc {
  margin: 14px 0 0;
  line-height: 1.55;
  white-space: pre-line;
}
.specs {
  margin: 18px 0 0;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.specs dt {
  font: 700 var(--t-xs) var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--slate);
}
.specs dd {
  margin: 2px 0 12px;
}
.specs dd:last-child {
  margin-bottom: 0;
}
.buy {
  margin-top: 18px;
  display: flex;
  justify-content: flex-start;
}
</style>
