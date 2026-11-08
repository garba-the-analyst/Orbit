<script setup lang="ts">
import { IonContent, IonPage, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
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
const form = reactive({ name: '', description: '', address: '', deliveryFee: '' });
const PREP_CHOICES = [10, 15, 20, 30, 45];

async function load() {
  error.value = '';
  try {
    shop.value = await api.merchant.shop();
    Object.assign(form, { name: shop.value.name, description: shop.value.description, address: shop.value.address, deliveryFee: String(shop.value.deliveryFee) });
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
      ...(shop.value?.offersDelivery ? { deliveryFee: parseNaira(form.deliveryFee) ?? 0 } : {}),
    });
    toast('Shop details saved.');
  } catch (e) {
    await showError(e);
  } finally {
    saving.value = false;
  }
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
          <div class="row" style="margin-top: 8px">
            <ShopSign :name="shop.name" :color="shop.color" :size="56" />
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
              <span class="label">Your delivery fee (₦)</span>
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
            <button class="btn btn-ink block" type="submit" :disabled="!dirty || saving">{{ saving ? 'Saving…' : 'Save shop details' }}</button>
          </form>
        </template>

        <div class="group"><AccountPanel embedded /></div>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
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
