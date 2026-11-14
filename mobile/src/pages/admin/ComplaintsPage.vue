<script setup lang="ts">
/** Admin views and resolves customer complaints. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import type { ComplaintView } from '../../api/types';
import { useLive } from '../../api/socket';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import { when } from '../../lib/format';
import { confirmAction, errorMessage, promptText, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const badges = useBadges();
const tab = ref<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'>('OPEN');
const items = ref<ComplaintView[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    const { items: data, total } = await api.admin.complaints(tab.value);
    items.value = data;
    if (tab.value === 'OPEN') badges.adminComplaints = total;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['admin.changed'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}
function show(t: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED') {
  tab.value = t;
  loading.value = true;
  load();
}
async function resolve(c: ComplaintView) {
  const note = await promptText({ title: 'Resolve complaint', message: 'What was done?', placeholder: 'Refund issued', confirm: 'Mark resolved' });
  if (!note) return;
  try {
    await api.admin.updateComplaint(c.id, { status: 'RESOLVED', adminResponse: note });
    success();
    toast('Complaint resolved.');
    load();
  } catch (e) {
    await showError(e);
  }
}
async function reject(c: ComplaintView) {
  const note = await promptText({ title: 'Reject complaint', message: 'Why was it rejected?', placeholder: 'No evidence of wrongdoing', confirm: 'Mark rejected' });
  if (!note) return;
  try {
    await api.admin.updateComplaint(c.id, { status: 'REJECTED', adminResponse: note });
    success();
    toast('Complaint rejected.');
    load();
  } catch (e) {
    await showError(e);
  }
}
async function inProgress(c: ComplaintView) {
  try {
    await api.admin.updateComplaint(c.id, { status: 'IN_PROGRESS' });
    toast('Marked in progress.');
    load();
  } catch (e) {
    await showError(e);
  }
}
function label(cat: string) {
  const m: Record<string, string> = {
    ORDER: 'Order', DELIVERY: 'Delivery', RIDER: 'Rider', MERCHANT: 'Merchant',
    PAYMENT: 'Payment', APP: 'App', OTHER: 'Other',
  };
  return m[cat] ?? cat;
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title" data-tour="admin-complaints">Complaints</h1>
        <div class="texttabs" role="tablist" style="margin-top: 12px">
          <button class="texttab" role="tab" :aria-selected="tab === 'OPEN'" @click="show('OPEN')">Open</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'IN_PROGRESS'" @click="show('IN_PROGRESS')">In progress</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'RESOLVED'" @click="show('RESOLVED')">Resolved</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'REJECTED'" @click="show('REJECTED')">Rejected</button>
        </div>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!items.length" :title="`No ${String(tab).toLowerCase()} complaints`" text="Customer complaints appear here." />
        <ul v-else class="list">
          <li v-for="c in items" :key="c.id" class="s">
            <div class="row between">
              <div>
                <strong>{{ c.subject }}</strong>
                <span class="badge">{{ label(c.category) }}</span>
              </div>
              <span class="status" :class="c.status === 'OPEN' ? 'bad' : c.status === 'RESOLVED' ? 'good' : 'warn'">{{ c.status.toLowerCase() }}</span>
            </div>
            <div class="small muted">{{ c.message }} {{ c.adminResponse ? ' · Admin: ' + c.adminResponse : '' }}</div>
            <div class="small muted">{{ c.person?.name ?? 'Unknown' }} · {{ when(c.createdAt) }}</div>
            <div class="btns">
              <button v-if="c.status === 'OPEN'" class="btn btn-line small-btn" @click="inProgress(c)">In progress</button>
              <button v-if="c.status === 'OPEN' || c.status === 'IN_PROGRESS'" class="btn btn-primary small-btn" @click="resolve(c)">Resolve</button>
              <button v-if="c.status === 'OPEN' || c.status === 'IN_PROGRESS'" class="btn btn-line small-btn" @click="reject(c)">Reject</button>
            </div>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.s {
  padding: 14px 0;
  display: grid;
  gap: 6px;
}
.btns {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--ink-wash);
  color: var(--ink);
  font-size: 0.75rem;
  margin-left: 8px;
}
</style>
