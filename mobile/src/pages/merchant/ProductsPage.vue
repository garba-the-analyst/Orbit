<script setup lang="ts">
import { IonContent, IonModal, IonPage, IonRefresher, IonRefresherContent, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import type { Product } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ListSkeleton from '../../components/ListSkeleton.vue';
import { naira } from '../../lib/format';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';
import { parseNaira } from '../../lib/validate';

const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    products.value = await api.merchant.products();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

// ---- Editor sheet ----------------------------------------------------------------------------------
const editing = ref<Product | 'new' | null>(null);
const saving = ref(false);
const formError = ref('');
const touched = ref(false);
const form = reactive({ name: '', description: '', price: '', stock: '', available: true });

function open(p: Product | 'new') {
  editing.value = p;
  formError.value = '';
  touched.value = false;
  if (p === 'new') Object.assign(form, { name: '', description: '', price: '', stock: '20', available: true });
  else Object.assign(form, { name: p.name, description: p.description, price: String(p.price), stock: String(p.stock), available: p.available });
}

const errs = computed(() => ({
  name: form.name.trim().length < 2 ? 'Enter the product name.' : null,
  price: (parseNaira(form.price) ?? 0) < 1 ? 'Enter a price in naira, like 2800.' : null,
  stock: parseNaira(form.stock) === null ? 'Enter how many you have, like 20. Use 0 if none.' : null,
}));
const err = (k: 'name' | 'price' | 'stock') => (touched.value ? errs.value[k] : null);

async function save() {
  touched.value = true;
  if (errs.value.name || errs.value.price || errs.value.stock) return;
  saving.value = true;
  formError.value = '';
  const body = {
    name: form.name.trim(),
    description: form.description.trim(),
    price: parseNaira(form.price)!,
    stock: parseNaira(form.stock)!,
    available: form.available,
  };
  try {
    if (editing.value === 'new') await api.merchant.createProduct(body);
    else if (editing.value) await api.merchant.updateProduct(editing.value.id, body);
    toast(editing.value === 'new' ? 'Product added.' : 'Product saved.');
    editing.value = null;
    await load();
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  const p = editing.value;
  if (!p || p === 'new') return;
  const ok = await confirmAction({
    title: `Delete ${p.name}?`,
    message: 'Past orders keep their details. To only hide it for now, switch off “Available to order” instead.',
    confirm: 'Delete product',
    cancel: 'Keep it',
    destructive: true,
  });
  if (!ok) return;
  try {
    await api.merchant.deleteProduct(p.id);
    editing.value = null;
    toast('Product deleted.');
    await load();
  } catch (e) {
    await showError(e);
  }
}

/** Quick switch from the list: hide or show without opening the editor. */
async function quickToggle(p: Product, available: boolean) {
  try {
    await api.merchant.updateProduct(p.id, { available });
    p.available = available;
  } catch (e) {
    await showError(e);
    load();
  }
}

const stockNote = (p: Product) => (p.stock <= 0 ? { text: 'Sold out', cls: 'bad' } : p.stock <= 5 ? { text: `Only ${p.stock} left`, cls: 'warn' } : { text: `${p.stock} in stock`, cls: 'muted' });
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <div class="row between" style="align-items: flex-end">
          <h1 class="title" style="margin-bottom: 0">Products</h1>
          <button class="btn btn-primary small-btn" @click="open('new')">Add product</button>
        </div>
        <p class="lede" style="margin-top: 8px">Stock goes down as customers order and returns if an order is cancelled.</p>

        <ListSkeleton v-if="loading" :sign="false" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>
        <EmptyState v-else-if="products.length === 0" title="Add your first product" text="Customers see your products as soon as you add them and your shop is open.">
          <button class="btn btn-primary" @click="open('new')">Add product</button>
        </EmptyState>

        <ul v-else class="list" style="margin-top: 8px">
          <li v-for="p in products" :key="p.id" class="p" style="padding: 0">
            <button class="edit" :class="{ hidden: !p.available }" :aria-label="`Edit ${p.name}`" @click="open(p)">
              <span class="grow">
                <span class="pn">{{ p.name }}</span>
                <span class="small block"><span class="money">{{ naira(p.price) }}</span> · <span :class="stockNote(p).cls">{{ stockNote(p).text }}</span></span>
                <span v-if="!p.available" class="status warn" style="margin-top: 4px">Hidden from customers</span>
              </span>
            </button>
            <ion-toggle :checked="p.available" :aria-label="`${p.name} available to order`" @ionChange="quickToggle(p, $event.detail.checked)" />
          </li>
        </ul>
      </main>

      <ion-modal class="sheet" :is-open="!!editing" :initial-breakpoint="0.92" :breakpoints="[0, 0.92]" @didDismiss="editing = null">
        <div class="sheetbody">
          <h2 class="title-sm" style="margin: 8px 0 18px">{{ editing === 'new' ? 'Add product' : 'Edit product' }}</h2>
          <form class="stack" style="--stack: 16px" novalidate @submit.prevent="save">
            <div v-if="formError" class="notice bad" role="alert">{{ formError }}</div>
            <label class="field">
              <span class="label">Name</span>
              <input v-model="form.name" class="input" :class="{ invalid: err('name') }" maxlength="100" placeholder="Jollof rice and chicken" />
              <span v-if="err('name')" class="error">{{ err('name') }}</span>
            </label>
            <label class="field">
              <span class="label">Description (optional)</span>
              <input v-model="form.description" class="input" maxlength="400" placeholder="Party jollof, one piece of fried chicken" />
            </label>
            <div class="two">
              <label class="field">
                <span class="label">Price (₦)</span>
                <input v-model="form.price" class="input" :class="{ invalid: err('price') }" inputmode="numeric" placeholder="2800" />
                <span v-if="err('price')" class="error">{{ err('price') }}</span>
              </label>
              <label class="field">
                <span class="label">In stock</span>
                <input v-model="form.stock" class="input" :class="{ invalid: err('stock') }" inputmode="numeric" placeholder="20" />
                <span v-if="err('stock')" class="error">{{ err('stock') }}</span>
              </label>
            </div>
            <label class="row between avail">
              <span>
                <span class="strong block">Available to order</span>
                <span class="small muted">Switch off to hide it without deleting.</span>
              </span>
              <ion-toggle v-model:checked="form.available" aria-label="Available to order" />
            </label>
            <button class="btn btn-primary block" type="submit" :disabled="saving">{{ saving ? 'Saving…' : editing === 'new' ? 'Add product' : 'Save changes' }}</button>
            <button v-if="editing !== 'new'" class="btn btn-bad block" type="button" @click="remove">Delete product</button>
          </form>
        </div>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.p {
  display: flex !important;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.edit {
  appearance: none;
  border: 0;
  background: none;
  flex: 1;
  min-width: 0;
  display: flex;
  text-align: left;
  padding: 16px 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.edit.hidden .pn {
  color: var(--slate-faint);
}
.pn {
  display: block;
  font: 600 var(--t-md) / 1.3 var(--font-display);
  letter-spacing: -0.01em;
}
.block {
  display: block;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.avail {
  padding: 14px 16px;
  border-radius: var(--r-input);
  background: var(--paper);
}
.sheetbody {
  padding: 20px var(--gutter) calc(28px + env(safe-area-inset-bottom));
  overflow-y: auto;
}
</style>
