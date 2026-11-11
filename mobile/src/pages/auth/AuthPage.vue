<script setup lang="ts">
/**
 * Sign in, register (customer, shop owner, driver or haulier), and password recovery, on one screen.
 * Registration shows the vehicle choices for drivers (bike, keke, car) and hauliers (van, truck, lorry,
 * long-haul), the shop details for merchants, and the terms people must accept in production.
 */
import { IonContent, IonIcon, IonModal, IonPage } from '@ionic/vue';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { LegalDoc, VehicleType } from '../../api/types';
import OrbitMark from '../../components/OrbitMark.vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { HEAVY_VEHICLES, LIGHT_VEHICLES, VEHICLE_LABEL } from '../../lib/format';
import { errorMessage, success, toast } from '../../lib/ui';
import { addressError, cleanPhone, emailError, nameError, passwordError, phoneError } from '../../lib/validate';
import { useAppConfig } from '../../stores/appConfig';
import { useAuth } from '../../stores/auth';

type Mode = 'signin' | 'register' | 'forgot' | 'reset';
type Kind = 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'HAULIER';

const auth = useAuth();
const cfg = useAppConfig();
const router = useRouter();
const route = useRoute();

const mode = ref<Mode>('signin');
const busy = ref(false);
const formError = ref('');
const info = ref('');
const showPassword = ref(false);
const touched = ref(false);
const legal = ref<LegalDoc | null>(null);
const legalOpen = ref(false);

const f = reactive({
  name: '',
  email: '',
  phone: '',
  password: '',
  kind: 'CUSTOMER' as Kind,
  shopName: '',
  shopCategory: 'Food',
  shopAddress: '',
  vehicle: 'MOTORCYCLE' as VehicleType,
  plate: '',
  vehicleModel: '',
  vehicleColor: '',
  accept: false,
  token: '',
});

const KINDS: Array<{ value: Kind; title: string; text: string }> = [
  { value: 'CUSTOMER', title: 'Customer', text: 'Book rides, send parcels, buy from shops.' },
  { value: 'MERCHANT', title: 'Shop owner', text: 'Sell goods and services, with your own riders.' },
  { value: 'DRIVER', title: 'Driver', text: 'Earn with a bike, keke or car.' },
  { value: 'HAULIER', title: 'Haulier', text: 'Van, truck or lorry for heavy and long-haul loads.' },
];
const vehicleChoices = computed<readonly VehicleType[]>(() => (f.kind === 'HAULIER' ? HEAVY_VEHICLES : LIGHT_VEHICLES));
const isDriver = computed(() => f.kind === 'DRIVER' || f.kind === 'HAULIER');

function pickKind(k: Kind) {
  f.kind = k;
  if (k === 'DRIVER' && !LIGHT_VEHICLES.includes(f.vehicle as never)) f.vehicle = 'MOTORCYCLE';
  if (k === 'HAULIER' && !HEAVY_VEHICLES.includes(f.vehicle as never)) f.vehicle = 'TRUCK';
}

onMounted(() => {
  const t = route.query.reset;
  if (typeof t === 'string' && t) {
    f.token = t;
    mode.value = 'reset';
  }
});

const errors = computed(() => {
  const e: Record<string, string | null> = {};
  if (mode.value === 'forgot') return { email: emailError(f.email) };
  if (mode.value === 'reset') return { password: passwordError(f.password) };
  e.email = emailError(f.email);
  e.password = mode.value === 'register' ? passwordError(f.password) : f.password ? null : 'Enter your password.';
  if (mode.value === 'register') {
    e.name = nameError(f.name);
    e.phone = phoneError(f.phone);
    if (f.kind === 'MERCHANT') {
      e.shopName = nameError(f.shopName, 'your shop name');
      e.shopAddress = addressError(f.shopAddress) ? 'Say where your shop is, like “Stall 4, Central Market, Kano”.' : null;
    }
    if (!f.accept) e.accept = 'Please accept the terms to continue.';
  }
  return e;
});
const hasErrors = computed(() => Object.values(errors.value).some(Boolean));
const err = (k: string) => (touched.value ? errors.value[k] : null);

async function submit() {
  touched.value = true;
  formError.value = '';
  info.value = '';
  if (hasErrors.value) return;
  busy.value = true;
  try {
    if (mode.value === 'signin') {
      await auth.login(f.email.trim().toLowerCase(), f.password);
    } else if (mode.value === 'forgot') {
      await api.forgotPassword(f.email.trim().toLowerCase());
      info.value = 'If that email has an ORBIT account, a reset link is on its way. It works for 30 minutes.';
      return;
    } else if (mode.value === 'reset') {
      await api.resetPassword(f.token, f.password);
      toast('Password changed. Sign in with your new password.');
      f.password = '';
      router.replace('/auth');
      return switchMode('signin');
    } else {
      await auth.register({
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: cleanPhone(f.phone),
        password: f.password,
        role: f.kind === 'DRIVER' || f.kind === 'HAULIER' ? 'RIDER' : f.kind,
        acceptTerms: true,
        ...(f.kind === 'MERCHANT' ? { shopName: f.shopName.trim(), shopCategory: f.shopCategory, shopAddress: f.shopAddress.trim() } : {}),
        ...(isDriver.value ? { vehicle: f.vehicle, ...(f.plate.trim() ? { plate: f.plate.trim() } : {}), ...(f.vehicleModel.trim() ? { vehicleModel: f.vehicleModel.trim() } : {}), ...(f.vehicleColor.trim() ? { vehicleColor: f.vehicleColor.trim() } : {}) } : {}),
      });
    }
    success();
    await router.replace(auth.user?.mustChangePassword ? '/change-password' : auth.isPending ? '/pending' : auth.home);
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function demoLogin(email: string) {
  const demo = cfg.config.demo;
  if (!demo) return;
  busy.value = true;
  formError.value = '';
  try {
    await auth.login(email, demo.password);
    await router.replace(auth.isPending ? '/pending' : auth.home);
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function switchMode(m: Mode) {
  mode.value = m;
  touched.value = false;
  formError.value = '';
  info.value = '';
}

async function openLegal() {
  legalOpen.value = true;
  if (!legal.value) legal.value = await api.legal().catch(() => null);
}

const title = computed(() => ({ signin: 'Welcome back', register: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' })[mode.value]);
const cta = computed(() => ({ signin: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Save new password' })[mode.value]);
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen auth">
        <div class="top"><span></span><ThemeToggle /></div>
        <header class="brand">
          <OrbitMark :size="72" animate="draw" />
          <h1>ORBIT</h1>
          <p class="muted">Rides, deliveries, freight and shops across {{ cfg.config.serviceArea }}</p>
        </header>

        <h2 class="heading ttl">{{ title }}</h2>

        <form class="stack" style="--stack: 16px" novalidate @submit.prevent="submit">
          <!-- Who are you? -->
          <fieldset v-if="mode === 'register'" class="kinds">
            <legend class="label">I want to…</legend>
            <label v-for="k in KINDS" :key="k.value" class="kind" :class="{ on: f.kind === k.value }">
              <input type="radio" name="kind" :value="k.value" :checked="f.kind === k.value" @change="pickKind(k.value)" />
              <strong>{{ k.title }}</strong>
              <small>{{ k.text }}</small>
            </label>
          </fieldset>

          <label v-if="mode === 'register'" class="field">
            <span class="label">Full name</span>
            <input v-model="f.name" class="input" :class="{ invalid: err('name') }" autocomplete="name" />
            <span v-if="err('name')" class="error">{{ err('name') }}</span>
          </label>

          <label v-if="mode !== 'reset'" class="field">
            <span class="label">Email</span>
            <input v-model="f.email" class="input" :class="{ invalid: err('email') }" type="email" inputmode="email" autocomplete="email" autocapitalize="none" />
            <span v-if="err('email')" class="error">{{ err('email') }}</span>
          </label>

          <label v-if="mode === 'register'" class="field">
            <span class="label">Phone number</span>
            <input v-model="f.phone" class="input" :class="{ invalid: err('phone') }" type="tel" inputmode="tel" autocomplete="tel" placeholder="08031234567 or +233244123456" />
            <span v-if="err('phone')" class="error">{{ err('phone') }}</span>
          </label>

          <label v-if="mode !== 'forgot'" class="field">
            <span class="label">{{ mode === 'reset' ? 'New password' : 'Password' }}</span>
            <span class="pw">
              <input v-model="f.password" class="input" :class="{ invalid: err('password') }" :type="showPassword ? 'text' : 'password'" :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'" />
              <button type="button" class="eye" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword"><ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" /></button>
            </span>
            <span v-if="err('password')" class="error">{{ err('password') }}</span>
            <span v-else-if="mode !== 'signin'" class="hint">At least 8 characters, with a letter and a number.</span>
          </label>

          <!-- Shop owner -->
          <template v-if="mode === 'register' && f.kind === 'MERCHANT'">
            <label class="field">
              <span class="label">Shop or business name</span>
              <input v-model="f.shopName" class="input" :class="{ invalid: err('shopName') }" />
              <span v-if="err('shopName')" class="error">{{ err('shopName') }}</span>
            </label>
            <label class="field">
              <span class="label">What do you sell?</span>
              <select v-model="f.shopCategory" class="input"><option v-for="c in cfg.config.categories" :key="c">{{ c }}</option></select>
            </label>
            <label class="field">
              <span class="label">Shop address</span>
              <input v-model="f.shopAddress" class="input" :class="{ invalid: err('shopAddress') }" autocomplete="street-address" />
              <span v-if="err('shopAddress')" class="error">{{ err('shopAddress') }}</span>
              <span class="hint">You can pin it on the map and add pictures after you sign in.</span>
            </label>
            <p class="notice">We verify every shop before it goes live. You can set up your catalogue while you wait.</p>
          </template>

          <!-- Driver or haulier -->
          <template v-if="mode === 'register' && isDriver">
            <div class="field">
              <span class="label">Your vehicle</span>
              <div class="vgrid">
                <button v-for="v in vehicleChoices" :key="v" type="button" class="veh" :class="{ on: f.vehicle === v }" @click="f.vehicle = v">
                  <VehicleIcon :type="v" :size="44" />
                  <span>{{ VEHICLE_LABEL[v] }}</span>
                </button>
              </div>
            </div>
            <label v-if="f.vehicle !== 'BICYCLE'" class="field"><span class="label">Plate number</span><input v-model="f.plate" class="input" autocapitalize="characters" placeholder="ABC-123XY" /></label>
            <div class="two">
              <label class="field"><span class="label">Make and model</span><input v-model="f.vehicleModel" class="input" placeholder="Toyota Hiace" /></label>
              <label class="field"><span class="label">Colour</span><input v-model="f.vehicleColor" class="input" placeholder="White" /></label>
            </div>
            <p class="notice">We verify your documents and vehicle before your first trip. You upload them in the Garage after signing up.</p>
          </template>

          <label v-if="mode === 'register'" class="accept">
            <input v-model="f.accept" type="checkbox" />
            <span>I agree to the <button type="button" class="btn-text inline" @click.prevent="openLegal">Terms and Privacy Notice</button>.</span>
          </label>
          <span v-if="err('accept')" class="error">{{ err('accept') }}</span>

          <p v-if="formError" class="notice bad" role="alert">{{ formError }}</p>
          <p v-if="info" class="notice good" role="status">{{ info }}</p>

          <button class="btn btn-primary block" type="submit" :disabled="busy">{{ busy ? 'Please wait…' : cta }}</button>
        </form>

        <p v-if="mode === 'signin'" class="alt"><button type="button" class="btn-text" @click="switchMode('forgot')">Forgot your password?</button></p>
        <p class="alt">
          <template v-if="mode === 'signin'">New to ORBIT? <button type="button" class="btn-text" @click="switchMode('register')">Create an account</button></template>
          <template v-else>Back to <button type="button" class="btn-text" @click="switchMode('signin')">sign in</button></template>
        </p>

        <section v-if="cfg.config.demo && mode === 'signin'" class="demo">
          <h3 class="heading">Try a demo account</h3>
          <p class="small muted">Test accounts with sample data. Not available in production.</p>
          <div class="chips">
            <button v-for="a in cfg.config.demo.accounts" :key="a.email" type="button" class="chip" :disabled="busy" @click="demoLogin(a.email)">{{ a.label }}</button>
          </div>
        </section>
      </main>

      <ion-modal :is-open="legalOpen" @didDismiss="legalOpen = false">
        <ion-content>
          <div class="legal">
            <h2>Terms and Privacy</h2>
            <p v-if="!legal" class="muted">Loading…</p>
            <template v-else><h3>Terms of use</h3><p>{{ legal.terms }}</p><h3>Privacy notice</h3><p>{{ legal.privacy }}</p></template>
            <button class="btn btn-ink block" type="button" @click="legalOpen = false">Close</button>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.auth {
  padding-bottom: 48px;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  margin: 4px 0 22px;
}
.brand h1 {
  margin: 8px 0 0;
  font: 800 1.9rem var(--font-display);
  letter-spacing: 0.22em;
  margin-right: -0.22em;
}
.brand p {
  margin: 0;
  max-width: 30ch;
}
.ttl {
  margin: 0 0 14px;
  font-size: var(--t-xl);
}
.kinds {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.kinds legend {
  grid-column: 1 / -1;
  padding: 0;
  margin-bottom: 4px;
}
.kind {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--line);
  transition: box-shadow var(--dur-2), background var(--dur-2);
}
.kind input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.kind small {
  color: var(--slate);
  line-height: 1.3;
}
.kind.on {
  box-shadow: inset 0 0 0 2.5px var(--ink);
  background: var(--ink-wash);
}
.pw {
  position: relative;
  display: block;
}
.pw .input {
  padding-right: 48px;
}
.eye {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--slate);
  font-size: 22px;
}
.vgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.veh {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border: 0;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--line);
  color: var(--ink);
  font: 600 var(--t-sm) var(--font-display);
  transition: all var(--dur-2) var(--ease);
}
.veh.on {
  box-shadow: inset 0 0 0 2.5px var(--ink);
  background: var(--ink-wash);
  transform: translateY(-2px);
}
.two {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
}
.accept {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: var(--t-sm);
}
.accept input {
  margin-top: 3px;
  width: 20px;
  height: 20px;
  accent-color: var(--ink);
}
.inline {
  padding: 0;
  min-height: 0;
}
.alt {
  text-align: center;
  margin: 16px 0 0;
  color: var(--slate);
}
.demo {
  margin-top: 32px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}
.legal {
  padding: 24px var(--gutter) 40px;
}
.legal p {
  white-space: pre-line;
  line-height: 1.55;
}
</style>
