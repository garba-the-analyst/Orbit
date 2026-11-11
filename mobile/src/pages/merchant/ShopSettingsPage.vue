<script setup lang="ts">
import { IonContent, IonPage, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import PlaceSheet from '../../components/PlaceSheet.vue';
import { pickImage, shrinkImage } from '../../lib/pick';

import { api } from '../../api/endpoints';
import type { Shop } from '../../api/types';
import AccountPanel from '../../components/AccountPanel.vue';
import ShopSign from '../../components/ShopSign.vue';
import { errorMessage, showError, toast } from '../../lib/ui';
import { parseNaira } from '../../lib/validate';

const shop = ref<Shop | null>(null);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const form = reactive({ name: '', description: '', address: '', deliveryFee: '', city: '', state: '', phone: '', openingHours: '' });
const placeOpen = ref(false);
const uploading = ref<'logo' | 'cover' | null>(null);
const PREP_CHOICES = [10, 15, 20, 30, 45];

async function load() {
  error.value = '';
  try {
    shop.value = await api.merchant.shop();
    Object.assign(form, { name: shop.value.name, description: shop.value.description, address: shop.value.address, deliveryFee: String(shop.value.deliveryFee), city: shop.value.city, state: shop.value.state, phone: shop.value.phone, openingHours: shop.value.openingHours });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);

/** Switches and chips save at once; the response is the source of truth. */
async function patch(body: Parameters<typeof api.merchant.updateShop>[0], message: string) {
  try {
    shop.value = await api.merchant.updateShop(body);
    toast(message);
  } catch (e) {
    await showError(e);
    load();
  }
}

const feeErr = computed(() => (form.deliveryFee && parseNaira(form.deliveryFee) === null ? 'Enter the fee in naira, like 400.' : null));
const dirty = computed(
  () =>
    !!shop.value &&
    (form.name.trim() !== shop.value.name ||
      form.description.trim() !== shop.value.description ||
      form.address.trim() !== shop.value.address ||
      form.city.trim() !== shop.value.city ||
      form.state.trim() !== shop.value.state ||
      form.phone.trim() !== shop.value.phone ||
      form.openingHours.trim() !== shop.value.openingHours ||
      (shop.value.offersDelivery && parseNaira(form.deliveryFee) !== shop.value.deliveryFee)),
);

async function saveDetails() {
  if (feeErr.value || form.name.trim().length < 2 || form.address.trim().length < 5) {
    toast('Check the shop name, address and delivery fee.', 'error');
    return;
  }
  saving.value = true;
  try {
    shop.value = await api.merchant.updateShop({
      name: form.name.trim(),
      description: form.description.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      phone: form.phone.trim(),
      openingHours: form.openingHours.trim(),
      ...(shop.value?.offersDelivery ? { deliveryFee: parseNaira(form.deliveryFee) ?? 0 } : {}),
    });
    toast('Shop details saved.');
  } catch (e) {
    await showError(e);
  } finally {
    saving.value = false;
  }
}

async function changeImage(kind: 'logo' | 'cover') {
  const [file] = await pickImage({ multiple: false });
  if (!file) return;
  uploading.value = kind;
  try {
    const up = await api.uploadImage(kind, await shrinkImage(file, kind === 'cover' ? 1600 : 600), file.name);
    shop.value = await api.merchant.updateShop(kind === 'logo' ? { logoUrl: up.url } : { coverUrl: up.url });
    toast(kind === 'logo' ? 'Logo updated.' : 'Cover picture updated.');
  } catch (e) {
    await showError(e);
  } finally {
    uploading.value = null;
  }
}

/** The shop's map pin: customers see distance to it, and riders navigate to it for pickups. */
async function pinPicked(p: { address: string; lat: number; lng: number }) {
  placeOpen.value = false;
  form.address = p.address || form.address;
  await patch({ lat: p.lat, lng: p.lng, address: form.address.trim() || p.address }, 'Shop location pinned.');
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <h1 class="title">My shop</h1>

        <div v-if="loading" class="skeleton" style="height: 120px; margin-top: 16px" role="status" aria-label="Loading"></div>
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 16px">
          {{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button>
        </div>

        <template v-else-if="shop">
          <div class="cover" :style="shop.coverUrl ? { backgroundImage: `url(${shop.coverUrl})` } : undefined">
            <button class="btn btn-quiet small-btn" type="button" :disabled="uploading === 'cover'" @click="changeImage('cover')">{{ uploading === 'cover' ? 'Uploading…' : shop.coverUrl ? 'Change cover' : 'Add cover picture' }}</button>
          </div>
          <div class="row" style="margin-top: 8px">
            <button class="logo" type="button" :aria-label="'Change logo'" :disabled="uploading === 'logo'" @click="changeImage('logo')">
              <img v-if="shop.logoUrl" :src="shop.logoUrl" :alt="shop.name" />
              <ShopSign v-else :name="shop.name" :color="shop.color" :size="56" />
              <span class="edit">Edit</span>
            </button>
            <div class="grow">
              <div class="strong">{{ shop.name }}</div>
              <span class="status" :class="shop.status === 'APPROVED' ? 'good' : 'warn'">{{ shop.status === 'APPROVED' ? 'Verified by ORBIT' : 'Waiting for verification' }}</span>
            </div>
          </div>

          <section class="group">
            <h2 class="heading">Ordering</h2>
            <label class="row between line">
              <span>
                <span class="strong block">Taking orders</span>
                <span class="small muted">Close for the day or when you run out.</span>
              </span>
              <ion-toggle :checked="shop.isOpen" aria-label="Taking orders" @ionChange="patch({ isOpen: $event.detail.checked }, $event.detail.checked ? 'You are open for orders.' : 'You are closed.')" />
            </label>
            <div class="line">
              <span class="strong block">Usual preparation time</span>
              <span class="small muted block" style="margin-bottom: 10px">Shown to customers and used when you accept an order.</span>
              <div class="chips" role="group" aria-label="Usual preparation time">
                <button v-for="m in PREP_CHOICES" :key="m" class="chip" :aria-pressed="shop.prepMinutes === m" @click="patch({ prepMinutes: m }, `Preparation time set to ${m} minutes.`)">{{ m }} min</button>
              </div>
            </div>
          </section>

          <section class="group">
            <h2 class="heading">Delivery</h2>
            <label class="row between line">
              <span>
                <span class="strong block">I deliver orders myself</span>
                <span class="small muted">Customers can choose “Shop delivers”. Customers can always choose an ORBIT rider or pickup.</span>
              </span>
              <ion-toggle :checked="shop.offersDelivery" aria-label="I deliver orders myself" @ionChange="patch({ offersDelivery: $event.detail.checked }, $event.detail.checked ? 'Customers can now choose your delivery.' : 'Your own delivery is off.')" />
            </label>
            <label v-if="shop.offersDelivery" class="field line">
              <span class="label">Your delivery fee ({{ shop.currency }})</span>
              <input v-model="form.deliveryFee" class="input" :class="{ invalid: feeErr }" inputmode="numeric" placeholder="400" />
              <span v-if="feeErr" class="error">{{ feeErr }}</span>
              <span v-else class="hint">You keep all of this fee. ORBIT takes no commission on delivery you do yourself.</span>
            </label>
          </section>

          <form class="group stack" style="--stack: 16px" novalidate @submit.prevent="saveDetails">
            <h2 class="heading">Shop details</h2>
            <label class="field">
              <span class="label">Shop name</span>
              <input v-model="form.name" class="input" maxlength="80" />
            </label>
            <label class="field">
              <span class="label">About your shop</span>
              <textarea v-model="form.description" class="input" maxlength="400" rows="3"></textarea>
            </label>
            <label class="field">
              <span class="label">Address</span>
              <input v-model="form.address" class="input" maxlength="200" />
            </label>
            <div class="two">
              <label class="field"><span class="label">City</span><input v-model="form.city" class="input" maxlength="60" /></label>
              <label class="field"><span class="label">State / region</span><input v-model="form.state" class="input" maxlength="60" /></label>
            </div>
            <label class="field"><span class="label">Shop phone</span><input v-model="form.phone" class="input" inputmode="tel" maxlength="20" /></label>
            <label class="field"><span class="label">Opening hours</span><input v-model="form.openingHours" class="input" maxlength="120" placeholder="Mon–Sat 8am–8pm" /></label>
            <div class="field">
              <span class="label">Map location</span>
              <button class="btn btn-line block" type="button" @click="placeOpen = true">{{ shop.lat != null ? 'Location pinned · change' : 'Pin my shop on the map' }}</button>
              <span class="hint">Customers see how far you are and riders navigate here to collect orders.</span>
            </div>
            <button class="btn btn-ink block" type="submit" :disabled="!dirty || saving">{{ saving ? 'Saving…' : 'Save shop details' }}</button>
          </form>
        </template>

        <PlaceSheet :open="placeOpen" title="Where is your shop?" :near="shop && shop.lat != null && shop.lng != null ? { lat: shop.lat, lng: shop.lng } : null" @pick="pinPicked" @close="placeOpen = false" />
        <div class="group"><AccountPanel embedded /></div>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.cover {
  height: 120px;
  margin-top: 12px;
  border-radius: 16px;
  background: var(--ink-wash) center / cover;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 10px;
}
.logo {
  position: relative;
  border: 0;
  padding: 0;
  background: none;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  overflow: hidden;
  flex: none;
}
.logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.edit {
  position: absolute;
  inset: auto 0 0 0;
  background: var(--scrim);
  color: #fff;
  font: 700 10px var(--font-display);
  padding: 2px 0;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.group {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.line {
  display: flex;
  margin-top: 16px;
}
.line.row {
  gap: 16px;
}
div.line {
  display: block;
}
label.field.line {
  display: block;
}
.block {
  display: block;
}
</style>
