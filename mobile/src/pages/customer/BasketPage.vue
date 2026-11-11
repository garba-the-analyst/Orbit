<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { Fulfilment } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import QtyStepper from '../../components/QtyStepper.vue';
import ShopSign from '../../components/ShopSign.vue';
import { money, plural } from '../../lib/format';
import PlaceSheet from '../../components/PlaceSheet.vue';
import type { Point } from '../../api/types';
import { showError, toast, tap } from '../../lib/ui';
import { cleanPhone, phoneError } from '../../lib/validate';
import { useAppConfig } from '../../stores/appConfig';
import { useAuth } from '../../stores/auth';
import { useCart } from '../../stores/cart';
import { useCheckout } from '../../stores/checkout';

const router = useRouter();
const cart = useCart();
const auth = useAuth();
const cfg = useAppConfig();
const checkout = useCheckout();

const fulfilment = ref<Fulfilment>('PICKUP');
const form = reactive({ address: '', note: '', phone: auth.user?.phone ?? '' });
const touched = ref(false);
const busy = ref(false);
const refreshing = ref(false);
const cur = ref(cfg.currency);
const m = (n: number) => money(n, cur.value);
const dropPoint = ref<Point | null>(null);
const picking = ref(false);

const shop = computed(() => cart.shop);
const isDelivery = computed(() => fulfilment.value !== 'PICKUP');

interface Option {
  value: Fulfilment;
  title: string;
  text: string;
  fee: number;
}
const options = computed<Option[]>(() => {
  const s = shop.value;
  if (!s) return [];
  const list: Option[] = [
    { value: 'PICKUP', title: 'Pick up', text: `Collect from ${s.address}`, fee: 0 },
  ];
  if (s.offersDelivery) list.push({ value: 'MERCHANT_DELIVERY', title: 'Shop delivers', text: `${s.name} brings it to you`, fee: s.deliveryFee });
  list.push({ value: 'ORBIT_COURIER', title: 'ORBIT rider', text: 'A verified rider collects and brings it, with live tracking', fee: (cfg.config.markets.find((k) => k.currency === cur.value)?.orbitDeliveryFee ?? cfg.orbitDeliveryFee) });
  return list;
});
const deliveryFee = computed(() => options.value.find((o) => o.value === fulfilment.value)?.fee ?? 0);
const total = computed(() => cart.subtotal + deliveryFee.value);

const errors = computed(() => ({
  address: isDelivery.value && !dropPoint.value ? 'Choose where to deliver.' : null,
  phone: phoneError(form.phone),
}));
const err = (k: 'address' | 'phone') => (touched.value ? errors.value[k] : null);

/** Re-checks prices, stock and shop settings with the server, so the person never pays on stale numbers. */
async function refresh() {
  if (!cart.shop) return;
  refreshing.value = true;
  try {
    const { shop: fresh, products } = await api.shop(cart.shop.id);
    cur.value = fresh.currency;
    const changes: string[] = [];
    const lines = [...cart.lines];
    for (const line of lines) {
      const p = products.find((x) => x.id === line.product.id);
      const summary = { id: fresh.id, name: fresh.name, color: fresh.color, isOpen: fresh.isOpen, prepMinutes: fresh.prepMinutes, offersDelivery: fresh.offersDelivery, deliveryFee: fresh.deliveryFee, address: fresh.address };
      if (!p || p.soldOut) {
        cart.setQty(summary, line.product, 0);
        changes.push(`${line.product.name} is no longer available`);
      } else {
        if (p.price !== line.product.price) changes.push(`${p.name} is now ${m(p.price)}`);
        if (p.stock < line.qty) changes.push(`Only ${p.stock} ${p.name} left`);
        cart.setQty(summary, { id: p.id, name: p.name, price: p.price, stock: p.stock }, line.qty);
      }
    }
    if (cart.shop) cart.shop = { ...cart.shop, isOpen: fresh.isOpen, offersDelivery: fresh.offersDelivery, deliveryFee: fresh.deliveryFee, address: fresh.address, prepMinutes: fresh.prepMinutes };
    if (changes.length) toast(`Basket updated: ${changes.join('. ')}.`);
    // A delivery option the shop no longer offers falls back to pickup.
    if (!options.value.some((o) => o.value === fulfilment.value)) fulfilment.value = 'PICKUP';
  } catch {
    /* offline: keep what we have; the server re-checks everything at payment anyway */
  } finally {
    refreshing.value = false;
  }
}
onIonViewWillEnter(() => {
  form.phone = form.phone || auth.user?.phone || '';
  refresh();
});

async function pay() {
  touched.value = true;
  if (!cart.shop || cart.isEmpty) return;
  if (errors.value.phone || errors.value.address) return;
  busy.value = true;
  try {
    const res = await api.createOrder({
      shopId: cart.shop.id,
      items: cart.lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
      fulfilment: fulfilment.value,
      contactPhone: cleanPhone(form.phone),
      ...(isDelivery.value
        ? {
            deliveryAddress: [form.address.trim(), dropPoint.value!.address].filter(Boolean).join(', ').slice(0, 240),
            deliveryLat: dropPoint.value!.lat,
            deliveryLng: dropPoint.value!.lng,
            deliveryNote: form.note.trim() || undefined,
          }
        : {}),
    });
    checkout.set(res.order.id, res.payment);
    cart.clear(); // stock is now reserved for this order
    await router.replace(`/c/pay/${res.order.id}`);
  } catch (e) {
    await showError(e);
    refresh();
  } finally {
    busy.value = false;
  }
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
      <main class="screen" style="padding-bottom: 56px">
        <EmptyState v-if="cart.isEmpty" title="Your basket is empty" text="Pick a shop and add something to get started.">
          <button class="btn btn-primary" @click="router.replace('/c/shops')">Browse shops</button>
        </EmptyState>

        <template v-else-if="shop">
          <h1 class="title-sm" style="margin-top: 4px">Your basket</h1>
          <div class="row" style="margin-top: 8px">
            <ShopSign :name="shop.name" :color="shop.color" :size="36" />
            <span class="strong">{{ shop.name }}</span>
          </div>

          <div v-if="!shop.isOpen" class="notice warn" style="margin-top: 16px">
            {{ shop.name }} has closed for now. Come back when it is open to pay for this basket.
          </div>

          <ul class="list" style="margin-top: 12px">
            <li v-for="l in cart.lines" :key="l.product.id" class="line">
              <div class="grow">
                <div class="lname">{{ l.product.name }}</div>
                <div class="small muted money">{{ m(l.product.price) }} each</div>
              </div>
              <QtyStepper :qty="l.qty" :max="Math.min(l.product.stock, cart.MAX_QTY)" :label="l.product.name" @change="cart.setQty(shop, l.product, $event)" />
              <div class="money lt">{{ m(l.qty * l.product.price) }}</div>
            </li>
          </ul>

          <fieldset class="how">
            <legend class="heading">How should it reach you?</legend>
            <label v-for="o in options" :key="o.value" class="opt" :class="{ on: fulfilment === o.value }" @click="tap()">
              <input v-model="fulfilment" type="radio" name="fulfilment" :value="o.value" />
              <span class="dot" aria-hidden="true"></span>
              <span class="grow">
                <span class="strong ot">{{ o.title }}</span>
                <span class="small muted">{{ o.text }}</span>
              </span>
              <span class="money">{{ o.fee === 0 ? 'Free' : m(o.fee) }}</span>
            </label>
          </fieldset>

          <div class="stack" style="margin-top: 20px; --stack: 16px">
            <template v-if="isDelivery">
              <div class="field">
                <span class="label">Where should we deliver?</span>
                <button type="button" class="input pickbtn" :class="{ invalid: err('address') }" @click="picking = true">{{ dropPoint?.address ?? 'Search or pin your location' }}</button>
                <span v-if="err('address')" class="error">{{ err('address') }}</span>
              </div>
              <label class="field">
                <span class="label">Flat, room or landmark (optional)</span>
                <input v-model="form.address" class="input" maxlength="80" autocomplete="off" placeholder="Block B, Room 12, green gate" />
              </label>
<label class="field">
                <span class="label">Note for the delivery person (optional)</span>
                <input v-model="form.note" class="input" maxlength="240" placeholder="Call when you reach the gate" />
              </label>
            </template>
            <label class="field">
              <span class="label">Phone number for this order</span>
              <input v-model="form.phone" class="input" :class="{ invalid: err('phone') }" type="tel" inputmode="tel" autocomplete="tel" />
              <span v-if="err('phone')" class="error">{{ err('phone') }}</span>
              <span v-else class="hint">{{ isDelivery ? 'The person delivering can call you here.' : 'The shop can call you here if there is a problem.' }}</span>
            </label>
          </div>

          <section class="receipt" aria-label="Order total">
            <div class="kv"><span>{{ plural(cart.itemCount, 'item') }}</span><span class="money">{{ m(cart.subtotal) }}</span></div>
            <div class="kv"><span>{{ fulfilment === 'PICKUP' ? 'Pickup' : 'Delivery' }}</span><span class="money">{{ deliveryFee === 0 ? 'Free' : m(deliveryFee) }}</span></div>
            <div class="kv total"><span>Total</span><span class="money">{{ m(total) }}</span></div>
          </section>

          <button class="btn btn-primary block" style="margin-top: 20px" :disabled="busy || refreshing || !shop.isOpen" @click="pay">
            {{ busy ? 'Placing order…' : `Pay ${m(total)}` }}
          </button>
          <p class="xsmall muted" style="margin: 12px 0 0; text-align: center">
            Your PIN for handover appears once you have paid. Prices are confirmed again when you pay.
          </p>
        </template>
      </main>
      <PlaceSheet :open="picking" title="Delivery address" :near="dropPoint" @pick="(p) => { dropPoint = p; picking = false; }" @close="picking = false" />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.pickbtn {
  text-align: left;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}
.line {
  display: flex !important;
  align-items: center;
  gap: 12px;
}
.lname {
  font: 600 var(--t-md) / 1.3 var(--font-display);
  letter-spacing: -0.01em;
}
.lt {
  min-width: 72px;
  text-align: right;
}
.how {
  border: 0;
  padding: 0;
  margin: 28px 0 0;
}
.how legend {
  padding: 0;
  margin-bottom: 12px;
}
.opt {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  margin-bottom: 8px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--line);
  cursor: pointer;
  min-height: var(--tap);
}
.opt.on {
  box-shadow: inset 0 0 0 2px var(--ink);
}
.opt input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.opt .dot {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--slate-faint);
}
.opt.on .dot {
  box-shadow: inset 0 0 0 2px var(--ink);
  background: radial-gradient(circle, var(--signal) 0 5px, var(--ink) 5.5px 100%);
}
.opt input:focus-visible + .dot {
  outline: 3px solid var(--ink);
  outline-offset: 2px;
}
.ot {
  display: block;
  font-family: var(--font-display);
}
.receipt {
  margin-top: 24px;
  padding: 8px 0 0;
}
</style>
