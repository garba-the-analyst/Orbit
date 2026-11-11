<script setup lang="ts">
/** Superadmin only: create up to the limit of other admins with temporary passwords, suspend, reset or remove them. */
import { IonContent, IonPage, onIonViewWillEnter } from '@ionic/vue';
import { reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import type { AdminList } from '../../api/types';
import Skeleton from '../../components/Skeleton.vue';
import { when } from '../../lib/format';
import { emailError, phoneError } from '../../lib/validate';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';

const data = ref<AdminList | null>(null);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const form = reactive({ name: '', email: '', phone: '', password: '' });

async function load() {
  error.value = '';
  try {
    data.value = await api.admin.admins();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);

function temp() {
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(r, (n) => a[n % a.length]).join('') + '#7';
}
async function create() {
  formError.value = form.name.trim().length < 2 ? 'Enter their name.' : emailError(form.email) || phoneError(form.phone) || (form.password.length < 10 ? 'The temporary password needs at least 10 characters.' : '');
  if (formError.value) return;
  saving.value = true;
  try {
    const a = await api.admin.createAdmin({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
    toast(`${a.name} added. Share the temporary password with them privately.`);
    Object.assign(form, { name: '', email: '', phone: '', password: '' });
    await load();
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
async function act(id: string, name: string, kind: 'suspend' | 'reactivate' | 'reset' | 'remove') {
  try {
    if (kind === 'suspend') {
      if (!(await confirmAction({ title: `Suspend ${name}?`, message: 'They are signed out and cannot sign in.', confirm: 'Suspend', cancel: 'Cancel', destructive: true }))) return;
      await api.admin.suspendAdmin(id);
    } else if (kind === 'reactivate') await api.admin.reactivateAdmin(id);
    else if (kind === 'remove') {
      if (!(await confirmAction({ title: `Remove ${name}?`, message: 'Their admin access is removed for good.', confirm: 'Remove', cancel: 'Cancel', destructive: true }))) return;
      await api.admin.removeAdmin(id);
    } else {
      const t = temp();
      if (!(await confirmAction({ title: `Reset ${name}’s password?`, message: `New temporary password: ${t}\nShare it privately. They must change it at next sign-in.`, confirm: 'Reset', cancel: 'Cancel' }))) return;
      await api.admin.resetAdminPassword(id, t);
    }
    toast('Done.');
    await load();
  } catch (e) {
    await showError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <h1 class="title">Admin team</h1>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}</div>
        <template v-else-if="data">
          <p class="lede">{{ data.used }} of {{ data.limit }} extra admins added. New admins must change their temporary password the first time they sign in.</p>
          <ul class="list">
            <li v-for="a in data.admins" :key="a.id" class="a">
              <div class="row between"><strong>{{ a.name }}</strong><span class="status" :class="a.isSuperAdmin ? 'good' : a.status === 'ACTIVE' ? '' : 'bad'">{{ a.isSuperAdmin ? 'Superadmin' : a.status.toLowerCase() }}</span></div>
              <div class="small muted">{{ a.email }} · {{ a.phone }} · added {{ when(a.createdAt) }}<template v-if="a.mustChangePassword"> · has not signed in yet</template></div>
              <div v-if="!a.isSuperAdmin" class="btns">
                <button v-if="a.status === 'ACTIVE'" class="btn btn-quiet small-btn" @click="act(a.id, a.name, 'suspend')">Suspend</button>
                <button v-else class="btn btn-quiet small-btn" @click="act(a.id, a.name, 'reactivate')">Reactivate</button>
                <button class="btn btn-quiet small-btn" @click="act(a.id, a.name, 'reset')">Reset password</button>
                <button class="btn btn-quiet small-btn" @click="act(a.id, a.name, 'remove')">Remove</button>
              </div>
            </li>
          </ul>

          <form v-if="data.used < data.limit" class="stack" style="--stack: 14px; margin-top: 32px" novalidate @submit.prevent="create">
            <h2 class="heading">Add an admin</h2>
            <label class="field"><span class="label">Full name</span><input v-model="form.name" class="input" autocomplete="off" /></label>
            <label class="field"><span class="label">Email</span><input v-model="form.email" class="input" type="email" autocomplete="off" autocapitalize="off" /></label>
            <label class="field"><span class="label">Phone</span><input v-model="form.phone" class="input" inputmode="tel" autocomplete="off" /></label>
            <label class="field"><span class="label">Temporary password</span>
              <input v-model="form.password" class="input" autocomplete="off" autocapitalize="off" />
              <button class="btn-text" type="button" style="justify-self: start" @click="form.password = temp()">Generate one</button>
            </label>
            <p v-if="formError" class="notice bad" role="alert">{{ formError }}</p>
            <button class="btn btn-primary block" type="submit" :disabled="saving">{{ saving ? 'Adding…' : 'Add admin' }}</button>
          </form>
          <p v-else class="notice" style="margin-top: 24px">You have reached the limit. Remove an admin to add another.</p>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.a {
  padding: 14px 0;
  display: grid;
  gap: 4px;
}
.btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.block {
  display: block;
}
</style>
