<script setup lang="ts">
/**
 * The shop's catalogue: goods and services, each with up to 6 pictures, a full description, size and weight,
 * a unit label and a goods type (food, perishable, fragile…) so riders and customers know how to handle it.
 */
import { IonContent, IonIcon, IonModal, IonPage, IonRefresher, IonRefresherContent, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { addOutline, closeCircle } from 'ionicons/icons';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import type { Product, ProductBody } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import GoodsTag from '../../components/GoodsTag.vue';
import Skeleton from '../../components/Skeleton.vue';
import { money } from '../../lib/format';
import { pickImage, shrinkImage } from '../../lib/pick';
import { autoTour } from '../../lib/tour';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';
import { parseNaira } from '../../lib/validate';
import { useAppConfig } from '../../stores/appConfig';

const cfg = useAppConfig();
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
onIonViewWillEnter(() => {
  load();
  autoTour('merchant', 1500);
});
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const editing = ref<Product | 'new' | null>(null);
const saving = ref(false);
const uploading = ref(false);
const formError = ref('');
const touched = ref(false);
const form = reactive({ name: '', description: '', price: '', stock: '', kind: 'GOOD' as 'GOOD' | 'SERVICE', goodsType: 'GENERAL', images: [] as string[], length: '', width: '', height: '', weight: '', unit: '', available: true });
const goods = computed(() => (cfg.config.goods.length ? cfg.config.goods : [{ type: 'GENERAL', label: 'Other goods' }]));

function open(p: Product | 'new') {
  editing.value = p;
  formError.value = '';
  touched.value = false;
  if (p === 'new') Object.assign(form, { name: '', description: '', price: '', stock: '20', kind: 'GOOD', goodsType: 'GENERAL', images: [], length: '', width: '', height: '', weight: '', unit: '', available: true });
  else
    Object.assign(form, {
      name: p.name,
      description: p.description,
      price: String(p.price),
      stock: String(p.stock),
      kind: p.kind,
      goodsType: p.goodsType,
      images: [...p.images],
      length: p.lengthCm ?? '',
      width: p.widthCm ?? '',
      height: p.heightCm ?? '',
      weight: p.weightKg ?? '',
      unit: p.unitLabel ?? '',
      available: p.available,
    });
}

const errs = computed(() => ({
  name: form.name.trim().length < 2 ? 'Enter the name.' : null,
  price: (parseNaira(form.price) ?? 0) < 1 ? 'Enter a price, like 2800.' : null,
  stock: parseNaira(form.stock) === null ? 'Enter how many you have. Use 0 if none.' : null,
}));
const err = (k: 'name' | 'price' | 'stock') => (touched.value ? errs.value[k] : null);

async function addImages() {
  const files = await pickImage({ multiple: true });
  if (!files.length) return;
  uploading.value = true;
  try {
    for (const f of files.slice(0, 6 - form.images.length)) form.images.push((await api.uploadImage('product', await shrinkImage(f, 1400), f.name)).url);
  } catch (e) {
    await showError(e);
  } finally {
    uploading.value = false;
  }
}
const num = (v: string | number) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function save() {
  touched.value = true;
  if (errs.value.name || errs.value.price || errs.value.stock) return;
  saving.value = true;
  formError.value = '';
  const body: ProductBody = {
    name: form.name.trim(),
    description: form.description.trim(),
    price: parseNaira(form.price)!,
    stock: parseNaira(form.stock)!,
    kind: form.kind,
    goodsType: form.kind === 'SERVICE' ? 'GENERAL' : form.goodsType,
    images: form.images,
    lengthCm: num(form.length),
    widthCm: num(form.width),
    heightCm: num(form.height),
    weightKg: num(form.weight),
    unitLabel: form.unit.trim() || null,
    available: form.available,
  };
  try {
    if (editing.value === 'new') await api.merchant.createProduct(body);
    else if (editing.value) await api.merchant.updateProduct(editing.value.id, body);
    toast(editing.value === 'new' ? 'Added to your catalogue.' : 'Saved.');
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
  const ok = await confirmAction({ title: `Delete ${p.name}?`, message: 'Past orders keep their details. To only hide it for now, switch off “Available to order” instead.', confirm: 'Delete', cancel: 'Keep it', destructive: true });
  if (!ok) return;
  try {
    await api.merchant.deleteProduct(p.id);
    editing.value = null;
    toast('Deleted.');
    await load();
  } catch (e) {
    await showError(e);
  }
}

async function quickToggle(p: Product, available: boolean) {
  try {
    await api.merchant.updateProduct(p.id, { available });
    p.available = available;
  } catch (e) {
    await showError(e);
    load();
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <div class="row between"><h1 class="title">Catalogue</h1><button class="btn btn-primary small-btn" type="button" @click="open('new')"><ion-icon :icon="addOutline" /> Add</button></div>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!products.length" title="Nothing listed yet" text="Add your goods and services with photos and descriptions. Customers see them as soon as your shop is approved.">
          <button class="btn btn-primary" @click="open('new')">Add your first item</button>
        </EmptyState>
        <ul v-else class="list">
          <li v-for="p in products" :key="p.id" class="prod" style="padding: 0">
            <button class="pbtn" type="button" @click="open(p)">
              <img v-if="p.images[0]" :src="p.images[0]" :alt="p.name" class="thumb" loading="lazy" />
              <span v-else class="thumb ph"></span>
              <span class="grow">
                <strong>{{ p.name }}</strong> <GoodsTag :type="p.goodsType" :kind="p.kind" />
                <span class="small muted block">{{ money(p.price, cfg.currency) }} · {{ p.kind === 'SERVICE' ? 'Service' : p.soldOut ? 'Sold out' : `${p.stock} in stock` }}</span>
              </span>
            </button>
            <ion-toggle :checked="p.available" :aria-label="`${p.name} available`" @ionChange="quickToggle(p, $event.detail.checked)" />
          </li>
        </ul>
      </main>

      <ion-modal :is-open="editing !== null" @didDismiss="editing = null">
        <ion-content>
          <form class="sheet stack" style="--stack: 16px" novalidate @submit.prevent="save">
            <div class="row between"><h2 class="heading" style="margin: 0">{{ editing === 'new' ? 'Add to catalogue' : 'Edit item' }}</h2><button class="btn-text" type="button" @click="editing = null">Close</button></div>

            <div class="seg2"><button type="button" :aria-pressed="form.kind === 'GOOD'" @click="form.kind = 'GOOD'">Goods</button><button type="button" :aria-pressed="form.kind === 'SERVICE'" @click="form.kind = 'SERVICE'">Service</button></div>

            <div class="field"><span class="label">Pictures (up to 6)</span>
              <div class="photos">
                <div v-for="(src, i) in form.images" :key="src" class="ph"><img :src="src" :alt="`Picture ${i + 1}`" /><button type="button" :aria-label="`Remove picture ${i + 1}`" @click="form.images.splice(i, 1)"><ion-icon :icon="closeCircle" /></button><span v-if="i === 0" class="main">Main</span></div>
                <button v-if="form.images.length < 6" type="button" class="add" :disabled="uploading" @click="addImages"><ion-icon :icon="addOutline" /><small>{{ uploading ? '…' : 'Add' }}</small></button>
              </div>
            </div>

            <label class="field"><span class="label">Name</span><input v-model="form.name" class="input" :class="{ invalid: err('name') }" maxlength="80" /><span v-if="err('name')" class="error">{{ err('name') }}</span></label>
            <label class="field"><span class="label">Full description</span><textarea v-model="form.description" class="input" rows="4" maxlength="1500" placeholder="What it is, what is included, materials, how to care for it"></textarea></label>
            <div class="two">
              <label class="field"><span class="label">Price</span><input v-model="form.price" class="input" :class="{ invalid: err('price') }" inputmode="numeric" /><span v-if="err('price')" class="error">{{ err('price') }}</span></label>
              <label class="field"><span class="label">{{ form.kind === 'SERVICE' ? 'Slots available' : 'In stock' }}</span><input v-model="form.stock" class="input" :class="{ invalid: err('stock') }" inputmode="numeric" /></label>
            </div>
            <label class="field"><span class="label">Sold per (optional)</span><input v-model="form.unit" class="input" maxlength="20" placeholder="kg, bag, plate, hour…" /></label>

            <template v-if="form.kind === 'GOOD'">
              <div class="field"><span class="label">Type of goods</span>
                <div class="chips"><button v-for="g in goods" :key="g.type" type="button" class="chip" :aria-pressed="form.goodsType === g.type" @click="form.goodsType = g.type">{{ g.label }}</button></div>
                <span class="hint">Food and perishables are handled and delivered with extra care.</span>
              </div>
              <div class="field"><span class="label">Size (cm) and weight (kg)</span>
                <div class="four"><input v-model="form.length" class="input" inputmode="decimal" placeholder="Length" aria-label="Length in cm" /><input v-model="form.width" class="input" inputmode="decimal" placeholder="Width" aria-label="Width in cm" /><input v-model="form.height" class="input" inputmode="decimal" placeholder="Height" aria-label="Height in cm" /><input v-model="form.weight" class="input" inputmode="decimal" placeholder="Weight" aria-label="Weight in kg" /></div>
              </div>
            </template>

            <label class="row between"><span><strong>Available to order</strong><br /><span class="small muted">Switch off to hide it for now.</span></span><ion-toggle v-model="form.available" /></label>
            <p v-if="formError" class="notice bad" role="alert">{{ formError }}</p>
            <button class="btn btn-primary block" type="submit" :disabled="saving || uploading">{{ saving ? 'Saving…' : 'Save' }}</button>
            <button v-if="editing !== 'new'" class="btn btn-quiet block" type="button" @click="remove">Delete this item</button>
          </form>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.prod {
  display: flex !important;
  align-items: center;
  gap: 10px;
  padding: 12px 0 !important;
}
.pbtn {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 0;
  background: none;
  color: inherit;
  padding: 0;
}
.thumb {
  flex: none;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--ink-wash);
}
.block {
  display: block;
}
.sheet {
  padding: calc(env(safe-area-inset-top, 0px) + 16px) var(--gutter) 40px;
}
.seg2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: 14px;
  background: var(--ink-wash);
}
.seg2 button {
  height: 42px;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--slate);
  font: 600 var(--t-md) var(--font-display);
}
.seg2 button[aria-pressed='true'] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}
.photos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ph,
.add {
  position: relative;
  width: 76px;
  height: 76px;
  border-radius: 12px;
}
.ph img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
}
.ph button {
  position: absolute;
  top: -8px;
  right: -8px;
  border: 0;
  background: var(--paper);
  border-radius: 50%;
  padding: 0;
  font-size: 22px;
  color: var(--bad);
  line-height: 0;
}
.main {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--on-ink);
  font: 700 10px var(--font-display);
}
.add {
  border: 2px dashed var(--line);
  background: none;
  color: var(--slate);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.four {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.four .input {
  padding-left: 8px;
  padding-right: 8px;
}
</style>
