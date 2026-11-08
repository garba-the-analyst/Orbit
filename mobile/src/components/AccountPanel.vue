<script setup lang="ts">
/** Profile editing and sign out. Used as a full screen (Account tab) and inside other screens (merchant "My shop"). */
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/endpoints';
import { VEHICLE_LABEL } from '../lib/format';
import { confirmAction, showError, toast } from '../lib/ui';
import { cleanPhone, nameError, phoneError } from '../lib/validate';
import { useAppConfig } from '../stores/appConfig';
import { useAuth } from '../stores/auth';
import { useCart } from '../stores/cart';

defineProps<{ embedded?: boolean }>();

const auth = useAuth();
const cfg = useAppConfig();
const cart = useCart();
const router = useRouter();

const form = reactive({ name: '', phone: '' });
const busy = ref(false);
const touched = ref(false);

watch(
  () => auth.user,
  (u) => {
    form.name = u?.name ?? '';
    form.phone = u?.phone ?? '';
  },
  { immediate: true },
);

const ROLE_LABEL: Record<string, string> = { CUSTOMER: 'Customer', MERCHANT: 'Shop owner', RIDER: 'Rider', ADMIN: 'ORBIT admin' };
const dirty = computed(() => form.name.trim() !== auth.user?.name || cleanPhone(form.phone) !== auth.user?.phone);
const nameErr = computed(() => (touched.value ? nameError(form.name) : null));
const phoneErr = computed(() => (touched.value ? phoneError(form.phone) : null));

async function save() {
  touched.value = true;
  if (nameError(form.name) || phoneError(form.phone)) return;
  busy.value = true;
  try {
    auth.setUser(await api.updateMe({ name: form.name.trim(), phone: cleanPhone(form.phone) }));
    toast('Details saved.');
    touched.value = false;
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  const ok = await confirmAction({
    title: 'Sign out of ORBIT?',
    message: auth.role === 'CUSTOMER' && !cart.isEmpty ? 'Your basket stays on this phone.' : undefined,
    confirm: 'Sign out',
    cancel: 'Stay signed in',
  });
  if (!ok) return;
  auth.logout();
  await router.replace('/auth');
}
</script>

<template>
  <section>
    <template v-if="!embedded">
      <h1 class="title">Account</h1>
      <p class="lede">{{ ROLE_LABEL[auth.role ?? 'CUSTOMER'] }} · {{ auth.user?.email }}</p>
    </template>
    <template v-else>
      <h2 class="heading">Your account</h2>
      <p class="small muted" style="margin: 4px 0 0">{{ ROLE_LABEL[auth.role ?? 'CUSTOMER'] }} · {{ auth.user?.email }}</p>
    </template>

    <form class="stack" style="margin-top: 20px; --stack: 18px" novalidate @submit.prevent="save">
      <label class="field">
        <span class="label">Name</span>
        <input v-model="form.name" class="input" :class="{ invalid: nameErr }" autocomplete="name" />
        <span v-if="nameErr" class="error">{{ nameErr }}</span>
      </label>
      <label class="field">
        <span class="label">Phone number</span>
        <input v-model="form.phone" class="input" :class="{ invalid: phoneErr }" type="tel" inputmode="tel" autocomplete="tel" />
        <span v-if="phoneErr" class="error">{{ phoneErr }}</span>
      </label>
      <p v-if="auth.user?.vehicle" class="small muted" style="margin: 0">Vehicle: {{ VEHICLE_LABEL[auth.user.vehicle] }}</p>
      <button class="btn btn-ink block" type="submit" :disabled="!dirty || busy">{{ busy ? 'Saving…' : 'Save details' }}</button>
    </form>

    <div v-if="!embedded" class="about">
      <h2 class="heading">About this pilot</h2>
      <p class="small muted">
        {{ cfg.config.pilotZone }}. ORBIT keeps {{ cfg.config.commissionPct }}% of item sales as commission. An ORBIT rider delivery costs
        ₦{{ cfg.config.orbitDeliveryFee.toLocaleString('en-NG') }}.
      </p>
      <p v-if="cfg.config.paymentProvider === 'mock'" class="notice warn" style="margin-top: 12px">Payments are in test mode. No real money moves.</p>
      <p class="xsmall muted" style="margin-top: 12px">ORBIT 1.0.0 · ENT 312 Venture Creation</p>
    </div>

    <button class="btn btn-line block" style="margin-top: 28px" @click="signOut">Sign out</button>
  </section>
</template>

<style scoped>
.about {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.about p {
  margin: 6px 0 0;
}
</style>
