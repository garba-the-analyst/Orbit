<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import OrbitMark from '../../components/OrbitMark.vue';
import { errorMessage, success } from '../../lib/ui';
import {
  addressError,
  cleanPhone,
  emailError,
  nameError,
  passwordError,
  phoneError,
} from '../../lib/validate';
import { SHOP_CATEGORIES, type Vehicle } from '../../api/types';
import { useAppConfig } from '../../stores/appConfig';
import { useAuth } from '../../stores/auth';
import { VEHICLE_LABEL } from '../../lib/format';

type Mode = 'signin' | 'register';
type RegRole = 'CUSTOMER' | 'MERCHANT' | 'RIDER';

const auth = useAuth();
const cfg = useAppConfig();
const router = useRouter();

const mode = ref<Mode>('signin');
const busy = ref(false);
const formError = ref('');
const showPassword = ref(false);
const touched = ref(false);

const f = reactive({
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'CUSTOMER' as RegRole,
  shopName: '',
  shopCategory: 'Food' as (typeof SHOP_CATEGORIES)[number],
  shopAddress: '',
  vehicle: 'MOTORCYCLE' as Vehicle,
});

const ROLES: Array<{ value: RegRole; title: string; text: string }> = [
  { value: 'CUSTOMER', title: 'Customer', text: 'Order from shops near you.' },
  { value: 'MERCHANT', title: 'Shop owner', text: 'Sell on ORBIT. We verify your shop before you go live.' },
  { value: 'RIDER', title: 'Rider', text: 'Deliver orders and earn. We verify you before your first job.' },
];

/** Field-level errors, shown only after the person tries to submit. */
const errors = computed(() => {
  const e: Record<string, string | null> = {
    email: emailError(f.email),
    password: mode.value === 'register' ? passwordError(f.password) : f.password ? null : 'Enter your password.',
  };
  if (mode.value === 'register') {
    e.name = nameError(f.name);
    e.phone = phoneError(f.phone);
    if (f.role === 'MERCHANT') {
      e.shopName = nameError(f.shopName, 'your shop name');
      e.shopAddress = addressError(f.shopAddress) ? 'Say where your shop is, like “Stall 4, Main Gate Food Court”.' : null;
    }
  }
  return e;
});
const hasErrors = computed(() => Object.values(errors.value).some(Boolean));
const err = (k: string) => (touched.value ? errors.value[k] : null);

async function submit() {
  touched.value = true;
  formError.value = '';
  if (hasErrors.value) return;
  busy.value = true;
  try {
    if (mode.value === 'signin') {
      await auth.login(f.email.trim().toLowerCase(), f.password);
    } else {
      await auth.register({
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: cleanPhone(f.phone),
        password: f.password,
        role: f.role,
        ...(f.role === 'MERCHANT'
          ? { shopName: f.shopName.trim(), shopCategory: f.shopCategory, shopAddress: f.shopAddress.trim() }
          : {}),
        ...(f.role === 'RIDER' ? { vehicle: f.vehicle } : {}),
      });
    }
    success();
    await router.replace(auth.isPending ? '/pending' : auth.home);
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
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen auth">
        <div class="brand row">
          <OrbitMark :size="34" />
          <span class="wordmark">ORBIT</span>
        </div>

        <h1 class="title">Order from shops near campus.</h1>
        <p class="lede">Pick it up, have the shop bring it, or send an ORBIT rider. You choose at checkout.</p>

        <div class="texttabs" role="tablist" aria-label="Sign in or create an account" style="margin-top: 22px">
          <button class="texttab" role="tab" :aria-selected="mode === 'signin'" @click="switchMode('signin')">Sign in</button>
          <button class="texttab" role="tab" :aria-selected="mode === 'register'" @click="switchMode('register')">Create account</button>
        </div>

        <form class="stack form" novalidate style="--stack: 18px" @submit.prevent="submit">
          <div v-if="formError" class="notice bad" role="alert">{{ formError }}</div>

          <fieldset v-if="mode === 'register'" class="roles">
            <legend class="label">I want to</legend>
            <label v-for="r in ROLES" :key="r.value" class="role" :class="{ on: f.role === r.value }">
              <input v-model="f.role" type="radio" name="role" :value="r.value" />
              <span class="dot" aria-hidden="true"></span>
              <span class="grow">
                <span class="strong rt">{{ r.title }}</span>
                <span class="small muted">{{ r.text }}</span>
              </span>
            </label>
          </fieldset>

          <label v-if="mode === 'register'" class="field">
            <span class="label">Your name</span>
            <input v-model="f.name" class="input" :class="{ invalid: err('name') }" autocomplete="name" placeholder="Zainab Musa" />
            <span v-if="err('name')" class="error">{{ err('name') }}</span>
          </label>

          <label class="field">
            <span class="label">Email</span>
            <input
              v-model="f.email"
              class="input"
              :class="{ invalid: err('email') }"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              placeholder="name@example.com"
            />
            <span v-if="err('email')" class="error">{{ err('email') }}</span>
          </label>

          <label v-if="mode === 'register'" class="field">
            <span class="label">Phone number</span>
            <input v-model="f.phone" class="input" :class="{ invalid: err('phone') }" type="tel" inputmode="tel" autocomplete="tel" placeholder="08031234567" />
            <span v-if="err('phone')" class="error">{{ err('phone') }}</span>
            <span v-else class="hint">Riders and shops use this to reach you about an order.</span>
          </label>

          <label class="field">
            <span class="label">Password</span>
            <span class="pw">
              <input
                v-model="f.password"
                class="input"
                :class="{ invalid: err('password') }"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
                placeholder="At least 8 characters"
              />
              <button type="button" class="reveal" :aria-pressed="showPassword" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </span>
            <span v-if="err('password')" class="error">{{ err('password') }}</span>
            <span v-else-if="mode === 'register'" class="hint">Use a letter and a number.</span>
          </label>

          <template v-if="mode === 'register' && f.role === 'MERCHANT'">
            <label class="field">
              <span class="label">Shop name</span>
              <input v-model="f.shopName" class="input" :class="{ invalid: err('shopName') }" placeholder="Mama Nkechi’s Kitchen" />
              <span v-if="err('shopName')" class="error">{{ err('shopName') }}</span>
            </label>
            <div class="field">
              <span class="label" id="cat-label">What do you sell?</span>
              <div class="chips" role="group" aria-labelledby="cat-label">
                <button v-for="c in SHOP_CATEGORIES" :key="c" type="button" class="chip" :aria-pressed="f.shopCategory === c" @click="f.shopCategory = c">
                  {{ c }}
                </button>
              </div>
            </div>
            <label class="field">
              <span class="label">Shop address</span>
              <input v-model="f.shopAddress" class="input" :class="{ invalid: err('shopAddress') }" placeholder="Stall 4, Main Gate Food Court" />
              <span v-if="err('shopAddress')" class="error">{{ err('shopAddress') }}</span>
            </label>
          </template>

          <div v-if="mode === 'register' && f.role === 'RIDER'" class="field">
            <span class="label" id="veh-label">How will you deliver?</span>
            <div class="chips" role="group" aria-labelledby="veh-label">
              <button v-for="(label, v) in VEHICLE_LABEL" :key="v" type="button" class="chip" :aria-pressed="f.vehicle === v" @click="f.vehicle = v as Vehicle">
                {{ label }}
              </button>
            </div>
          </div>

          <button class="btn btn-primary block" type="submit" :disabled="busy">
            {{ busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : f.role === 'CUSTOMER' ? 'Create account' : 'Send for verification' }}
          </button>
        </form>

        <section v-if="cfg.config.demo" class="demo" aria-labelledby="demo-h">
          <h2 id="demo-h" class="heading">Try a demo account</h2>
          <p class="small muted">Sample shops and people for testing. Tap one to sign in.</p>
          <div class="chips" style="margin-top: 12px">
            <button v-for="a in cfg.config.demo.accounts" :key="a.email" class="chip" :disabled="busy" @click="demoLogin(a.email)">
              {{ a.label }}
            </button>
          </div>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.auth {
  padding-top: calc(var(--ion-safe-area-top, 0px) + 20px);
}
.brand {
  gap: 10px;
}
.wordmark {
  font: 700 var(--t-lg) / 1 var(--font-display);
  letter-spacing: 0.02em;
}
.form {
  margin-top: 22px;
}
.roles {
  border: 0;
  padding: 0;
  margin: 0;
}
.roles legend,
.label {
  font: 600 var(--t-sm) / 1.2 var(--font-display);
  margin-bottom: 8px;
  padding: 0;
}
.role {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: var(--r-input);
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--line);
  cursor: pointer;
  margin-bottom: 8px;
  min-height: var(--tap);
}
.role.on {
  box-shadow: inset 0 0 0 2px var(--ink);
}
.role input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.role .dot {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--slate-faint);
}
.role.on .dot {
  box-shadow: inset 0 0 0 2px var(--ink);
  background: radial-gradient(circle, var(--signal) 0 5px, var(--ink) 5.5px 100%);
}
.role input:focus-visible + .dot {
  outline: 3px solid var(--ink);
  outline-offset: 2px;
}
.rt {
  display: block;
  font-family: var(--font-display);
}
.pw {
  position: relative;
  display: block;
}
.pw .input {
  padding-right: 76px;
}
.reveal {
  position: absolute;
  right: 4px;
  top: 4px;
  bottom: 4px;
  min-width: 64px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font: 600 var(--t-sm) / 1 var(--font-display);
  cursor: pointer;
}
.demo {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.demo p {
  margin: 4px 0 0;
}
</style>
