<script setup lang="ts">
/** Change your password. Shown automatically (and cannot be skipped) when an admin set you a temporary one. */
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, session } from '../../api/client';
import { api } from '../../api/endpoints';
import { connectSocket } from '../../api/socket';
import { errorMessage, success } from '../../lib/ui';
import { passwordError } from '../../lib/validate';
import { useAuth } from '../../stores/auth';

const auth = useAuth();
const router = useRouter();
const current = ref('');
const next = ref('');
const again = ref('');
const busy = ref(false);
const error = ref('');
const touched = ref(false);
const forced = computed(() => !!auth.user?.mustChangePassword);

const nextErr = computed(() => (touched.value ? passwordError(next.value) : null));
const againErr = computed(() => (touched.value && next.value !== again.value ? 'The two passwords do not match.' : null));

async function submit() {
  touched.value = true;
  error.value = '';
  if (!current.value || passwordError(next.value) || next.value !== again.value) return;
  busy.value = true;
  try {
    const res = (await api.changePassword(current.value, next.value)) as { token?: string };
    // Changing the password signs out every other device; the server hands this one a fresh token.
    if (res?.token) {
      session.token = res.token;
      connectSocket(res.token);
    }
    await auth.refresh();
    success();
    router.replace(auth.home);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-header v-if="!forced" class="ion-no-border"><ion-toolbar><ion-buttons slot="start"><ion-back-button default-href="/" text="" /></ion-buttons></ion-toolbar></ion-header>
    <ion-content :fullscreen="true">
      <main class="screen">
        <h1 class="title">{{ forced ? 'Set your own password' : 'Change password' }}</h1>
        <p v-if="forced" class="lede">You signed in with a temporary password. Choose a new one before you continue.</p>
        <form class="stack" style="margin-top: 22px; --stack: 16px" novalidate @submit.prevent="submit">
          <label class="field"><span class="label">{{ forced ? 'Temporary password' : 'Current password' }}</span><input v-model="current" class="input" type="password" autocomplete="current-password" /></label>
          <label class="field"><span class="label">New password</span><input v-model="next" class="input" :class="{ invalid: nextErr }" type="password" autocomplete="new-password" /><span v-if="nextErr" class="error">{{ nextErr }}</span></label>
          <label class="field"><span class="label">Repeat new password</span><input v-model="again" class="input" :class="{ invalid: againErr }" type="password" autocomplete="new-password" /><span v-if="againErr" class="error">{{ againErr }}</span></label>
          <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
          <button class="btn btn-primary block" type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save new password' }}</button>
          <button v-if="forced" class="btn btn-line block" type="button" @click="auth.logout()">Sign out</button>
        </form>
      </main>
    </ion-content>
  </ion-page>
</template>
