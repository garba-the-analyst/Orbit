<script setup lang="ts">
/** Customer submits a complaint about an order, delivery, rider, merchant, payment, app or other issue. */
import { IonContent, IonPage, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';

const route = useRoute();
const router = useRouter();

const form = ref({ category: 'OTHER', subject: '', message: '' });
const saving = ref(false);
const error = ref('');

const categories = [
  { value: 'ORDER', label: 'Order issue' },
  { value: 'DELIVERY', label: 'Delivery problem' },
  { value: 'RIDER', label: 'Rider behaviour' },
  { value: 'MERCHANT', label: 'Merchant issue' },
  { value: 'PAYMENT', label: 'Payment problem' },
  { value: 'APP', label: 'App bug or crash' },
  { value: 'OTHER', label: 'Something else' },
];

async function submit() {
  error.value = '';
  if (!form.value.subject.trim()) {
    error.value = 'Please enter a subject.';
    return;
  }
  if (!form.value.message.trim()) {
    error.value = 'Please describe the issue.';
    return;
  }
  saving.value = true;
  try {
    await api.createComplaint({
      category: form.value.category,
      subject: form.value.subject.trim(),
      message: form.value.message.trim(),
    });
    success();
    toast('Complaint submitted. We will review it and get back to you.');
    router.replace('/c/account');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <h1 class="title">Report a problem</h1>
        <p class="lede" style="margin-bottom: 24px">Something went wrong? Tell us what happened and we will look into it.</p>

        <form class="stack" style="--stack: 16px" novalidate @submit.prevent="submit">
          <label class="field">
            <span class="label">What is this about?</span>
            <select v-model="form.category" class="input">
              <option v-for="c in categories" :value="c.value" :key="c.value">{{ c.label }}</option>
            </select>
          </label>

          <label class="field">
            <span class="label">Subject</span>
            <input v-model="form.subject" class="input" placeholder="e.g. Rider never arrived" autocomplete="off" />
          </label>

          <label class="field">
            <span class="label">What happened?</span>
            <textarea v-model="form.message" class="input" rows="4" placeholder="Tell us the details so we can investigate." autocomplete="off"></textarea>
          </label>

          <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

          <button class="btn btn-primary block" type="submit" :disabled="saving">{{ saving ? 'Sending…' : 'Submit complaint' }}</button>
        </form>

        <p class="small muted" style="margin-top: 24px; text-align: center">Complaints are reviewed by the admin team. You will get a reply on this screen.</p>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-input);
  background: var(--surface);
  color: var(--ink);
  font-size: 1rem;
}
.input::placeholder {
  color: var(--slate-faint);
}
textarea.input {
  resize: vertical;
  min-height: 120px;
}
</style>
