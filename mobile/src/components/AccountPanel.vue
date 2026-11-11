<script setup lang="ts">
/**
 * Profile, appearance, privacy and sign out. Used as a full screen (Account tab) and embedded in other screens
 * (merchant "My shop"). Includes the things a real pilot needs: change picture, dark mode, replay the tour,
 * change password, download my data, delete my account.
 */
import { IonIcon } from '@ionic/vue';
import { cameraOutline } from 'ionicons/icons';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/endpoints';
import { VEHICLE_LABEL } from '../lib/format';
import { pickImage, shrinkImage } from '../lib/pick';
import { resetTours } from '../lib/tour';
import { confirmAction, promptText, showError, toast } from '../lib/ui';
import { cleanPhone, nameError, phoneError } from '../lib/validate';
import { useAppConfig } from '../stores/appConfig';
import { useAuth } from '../stores/auth';
import { useCart } from '../stores/cart';
import { useTheme, type ThemePref } from '../stores/theme';
import Avatar from './Avatar.vue';

defineProps<{ embedded?: boolean }>();

const auth = useAuth();
const cfg = useAppConfig();
const cart = useCart();
const theme = useTheme();
const router = useRouter();

const form = reactive({ name: '', phone: '' });
const busy = ref(false);
const uploading = ref(false);
const touched = ref(false);

watch(
  () => auth.user,
  (u) => {
    form.name = u?.name ?? '';
    form.phone = u?.phone ?? '';
  },
  { immediate: true },
);

const ROLE_LABEL: Record<string, string> = { CUSTOMER: 'Customer', MERCHANT: 'Shop owner', RIDER: 'Driver', ADMIN: 'ORBIT admin' };
const dirty = computed(() => form.name.trim() !== auth.user?.name || cleanPhone(form.phone) !== auth.user?.phone);
const nameErr = computed(() => (touched.value ? nameError(form.name) : null));
const phoneErr = computed(() => (touched.value ? phoneError(form.phone) : null));
const THEMES: Array<{ v: ThemePref; label: string }> = [
  { v: 'system', label: 'Auto' },
  { v: 'light', label: 'Light' },
  { v: 'dark', label: 'Dark' },
];

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

async function changePicture() {
  const [file] = await pickImage();
  if (!file) return;
  uploading.value = true;
  try {
    const up = await api.uploadImage('avatar', await shrinkImage(file, 800), file.name);
    auth.setUser(await api.updateMe({ avatarUrl: up.url }));
    toast('Picture updated.');
  } catch (e) {
    await showError(e);
  } finally {
    uploading.value = false;
  }
}

function replayTour() {
  resetTours();
  router.push(auth.home);
  toast('Tour restarts on your home screen.');
}

async function exportData() {
  try {
    const data = await api.exportData();
    const file = new File([JSON.stringify(data, null, 2)], 'orbit-my-data.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My ORBIT data' }).catch(() => undefined);
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) {
    showError(e);
  }
}

async function deleteAccount() {
  const ok = await confirmAction({ title: 'Delete your account?', message: 'Your personal details are erased and you are signed out everywhere. Order and trip records are kept without your name for accounting. This cannot be undone.', confirm: 'Continue', cancel: 'Keep my account', destructive: true });
  if (!ok) return;
  const password = await promptText({ title: 'Confirm with your password', type: 'password', placeholder: 'Password', confirm: 'Delete my account' });
  if (!password) return;
  try {
    await api.deleteAccount(password);
    auth.logout();
    toast('Your account has been deleted.');
    router.replace('/auth');
  } catch (e) {
    showError(e);
  }
}

async function signOut() {
  const ok = await confirmAction({ title: 'Sign out of ORBIT?', message: !cart.isEmpty ? 'Your basket stays on this phone.' : undefined, confirm: 'Sign out', cancel: 'Stay signed in' });
  if (!ok) return;
  auth.logout();
  await router.replace('/auth');
}
</script>

<template>
  <section>
    <template v-if="!embedded">
      <h1 class="title">Account</h1>
    </template>
    <template v-else>
      <h2 class="heading">Your account</h2>
    </template>

    <div class="who">
      <button class="avwrap" type="button" aria-label="Change picture" :disabled="uploading" @click="changePicture">
        <Avatar :name="auth.user?.name ?? ''" :src="auth.user?.avatarUrl" :size="72" />
        <span class="cam"><ion-icon :icon="cameraOutline" /></span>
      </button>
      <div>
        <strong class="nm">{{ auth.user?.name }}</strong>
        <p class="small muted" style="margin: 2px 0 0">{{ ROLE_LABEL[auth.role ?? 'CUSTOMER'] }} · {{ auth.user?.email }}</p>
        <p v-if="uploading" class="xsmall muted" style="margin: 2px 0 0">Uploading…</p>
      </div>
    </div>

    <form class="stack" style="margin-top: 22px; --stack: 18px" novalidate @submit.prevent="save">
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
      <p v-if="auth.user?.vehicle" class="small muted" style="margin: 0">Active vehicle: {{ VEHICLE_LABEL[auth.user.vehicle] }}</p>
      <button class="btn btn-ink block" type="submit" :disabled="!dirty || busy">{{ busy ? 'Saving…' : 'Save details' }}</button>
    </form>

    <template v-if="!embedded">
      <h2 class="heading sec">Appearance</h2>
      <div class="seg" role="radiogroup" aria-label="Theme">
        <button v-for="t in THEMES" :key="t.v" type="button" role="radio" :aria-checked="theme.pref === t.v" @click="theme.set(t.v)">{{ t.label }}</button>
      </div>

      <h2 class="heading sec">Help and privacy</h2>
      <ul class="list menu">
        <li><button class="rowlink" type="button" @click="replayTour">Take the app tour</button></li>
        <li><button class="rowlink" type="button" @click="router.push('/n')">Notifications</button></li>
        <li v-if="auth.role !== 'ADMIN'"><button class="rowlink" type="button" @click="router.push('/change-password')">Change password</button></li>
        <li v-else><button class="rowlink" type="button" @click="router.push('/change-password')">Change password</button></li>
        <li><button class="rowlink" type="button" @click="exportData">Download my data</button></li>
        <li><button class="rowlink danger" type="button" @click="deleteAccount">Delete my account</button></li>
      </ul>

      <div class="about">
        <h2 class="heading">About ORBIT</h2>
        <p class="small muted">Available in {{ cfg.config.serviceArea }}. ORBIT keeps {{ cfg.config.commissionPct }}% of shop item sales and {{ cfg.config.tripCommissionPct }}% of trip fares as commission.</p>
        <p v-if="cfg.config.testMode" class="notice warn" style="margin-top: 12px"><strong>Test mode.</strong> Payments are simulated. No real money moves.</p>
        <p class="xsmall muted" style="margin-top: 12px">ORBIT 2.0 · ENT 312 Venture Creation</p>
      </div>
    </template>

    <button class="btn btn-line block" style="margin-top: 28px" @click="signOut">Sign out</button>
  </section>
</template>

<style scoped>
.who {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-top: 16px;
}
.avwrap {
  position: relative;
  border: 0;
  background: none;
  padding: 0;
  border-radius: 50%;
}
.cam {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--signal);
  color: var(--on-signal);
  border: 2px solid var(--paper);
  font-size: 15px;
}
.nm {
  font: 700 var(--t-lg) var(--font-display);
}
.sec {
  margin: 32px 0 10px;
}
.seg {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 4px;
  border-radius: 14px;
  background: var(--ink-wash);
}
.seg button {
  height: 42px;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--slate);
  font: 600 var(--t-md) var(--font-display);
  transition: all var(--dur-2) var(--ease);
}
.seg button[aria-checked='true'] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}
.menu .danger {
  color: var(--bad);
}
.about {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.about p {
  margin: 6px 0 0;
}
</style>
