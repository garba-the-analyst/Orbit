<script setup lang="ts">
import { IonContent, IonPage, IonToggle, onIonViewWillEnter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import type { Promo } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import { money, when } from '../../lib/format';
import { errorMessage, showError, toast } from '../../lib/ui';

const promos = ref<Promo[]>([]);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const form = reactive({ code: '', type: 'PERCENT' as 'PERCENT' | 'FLAT', value: '', maxDiscount: '', validDays: '30', maxUses: '' });

async function load() {
  try {
    promos.value = await api.admin.promos();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);

const label = (p: Promo) => (p.type === 'PERCENT' ? `${p.value}% off${p.maxDiscount ? `, up to ${money(p.maxDiscount, p.currency)}` : ''}` : `${money(p.value, p.currency)} off`);
const valid = computed(() => /^[A-Za-z0-9]{3,20}$/.test(form.code.trim()) && Number(form.value) > 0 && (form.type === 'FLAT' || Number(form.value) <= 100));

async function create() {
  if (!valid.value) {
    formError.value = 'Use a code of 3 to 20 letters or numbers, and a value (percent up to 100).';
    return;
  }
  saving.value = true;
  formError.value = '';
  const n = (v: string) => (Number(v) > 0 ? Number(v) : undefined);
  try {
    await api.admin.createPromo({ code: form.code.trim().toUpperCase(), type: form.type, value: Number(form.value), maxDiscount: n(form.maxDiscount), validDays: n(form.validDays), maxUses: n(form.maxUses) });
    Object.assign(form, { code: '', value: '', maxDiscount: '', maxUses: '' });
    toast('Promo code created.');
    await load();
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
async function toggle(p: Promo, active: boolean) {
  try {
    const r = await api.admin.setPromo(p.id, active);
    p.active = r.active;
  } catch (e) {
    await showError(e);
    load();
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <h1 class="title">Promo codes</h1>
        <p class="lede">Customers enter a code when booking a ride or parcel. The discount comes out of ORBIT’s commission, never the driver’s pay.</p>
        <form class="stack" style="--stack: 14px; margin-top: 20px" novalidate @submit.prevent="create">
          <label class="field"><span class="label">Code</span><input v-model="form.code" class="input" maxlength="20" autocapitalize="characters" placeholder="WELCOME20" /></label>
          <div class="seg2"><button type="button" :aria-pressed="form.type === 'PERCENT'" @click="form.type = 'PERCENT'">Percent</button><button type="button" :aria-pressed="form.type === 'FLAT'" @click="form.type = 'FLAT'">Flat amount</button></div>
          <div class="two">
            <label class="field"><span class="label">{{ form.type === 'PERCENT' ? 'Percent off' : 'Amount off' }}</span><input v-model="form.value" class="input" inputmode="numeric" /></label>
            <label v-if="form.type === 'PERCENT'" class="field"><span class="label">Max discount</span><input v-model="form.maxDiscount" class="input" inputmode="numeric" placeholder="Optional" /></label>
          </div>
          <div class="two">
            <label class="field"><span class="label">Valid for (days)</span><input v-model="form.validDays" class="input" inputmode="numeric" /></label>
            <label class="field"><span class="label">Max uses</span><input v-model="form.maxUses" class="input" inputmode="numeric" placeholder="Unlimited" /></label>
          </div>
          <p v-if="formError" class="notice bad" role="alert">{{ formError }}</p>
          <button class="btn btn-primary block" type="submit" :disabled="saving">{{ saving ? 'Creating…' : 'Create code' }}</button>
        </form>

        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}</div>
        <EmptyState v-else-if="!promos.length" title="No codes yet" text="Create your first code above." />
        <ul v-else class="list" style="margin-top: 28px">
          <li v-for="p in promos" :key="p.id" class="p">
            <span class="grow"><strong class="code">{{ p.code }}</strong><span class="small muted block">{{ label(p) }}</span><span class="xsmall muted block">{{ p.uses ?? 0 }}{{ p.maxUses ? ` / ${p.maxUses}` : '' }} used<template v-if="p.validUntil"> · until {{ when(p.validUntil) }}</template></span></span>
            <ion-toggle :checked="p.active" :aria-label="`${p.code} active`" @ionChange="toggle(p, $event.detail.checked)" />
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.block {
  display: block;
}
.p {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
}
.code {
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
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
</style>
