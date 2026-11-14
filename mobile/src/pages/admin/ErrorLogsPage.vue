<script setup lang="ts">
/** Admin views and manages client-side error logs reported from the app. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import type { ErrorLogView } from '../../api/types';
import { useLive } from '../../api/socket';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import { when } from '../../lib/format';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const badges = useBadges();
const tab = ref<'all' | 'reviewed' | 'unreviewed'>('all');
const items = ref<ErrorLogView[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    const reviewed = tab.value === 'all' ? undefined : tab.value === 'unreviewed' ? false : true;
    const { items: data, total: count } = await api.admin.errorLogs(reviewed);
    items.value = data;
    total.value = count;
    if (tab.value === 'all') badges.adminErrors = data.filter((e) => !e.reviewed).length;
    else if (tab.value === 'unreviewed') badges.adminErrors = count;
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
function show(t: 'all' | 'reviewed' | 'unreviewed') {
  tab.value = t;
  loading.value = true;
  load();
}
async function markReviewed(c: ErrorLogView, reviewed: boolean) {
  try {
    await api.admin.markErrorReviewed(c.id, reviewed);
    success();
    load();
  } catch (e) {
    await showError(e);
  }
}
async function remove(c: ErrorLogView) {
  const ok = await confirmAction({
    title: 'Delete this error log?',
    message: 'This cannot be undone.',
    confirm: 'Delete',
    cancel: 'Cancel',
    destructive: true,
  });
  if (!ok) return;
  try {
    await api.admin.deleteErrorLog(c.id);
    toast('Deleted.');
    load();
  } catch (e) {
    await showError(e);
  }
}
function label(method: string) {
  const m: Record<string, string> = {
    GET: 'GET', POST: 'POST', PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE',
    CLIENT: 'client',
  };
  return m[method] ?? method;
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title" data-tour="admin-error-logs">Error Logs</h1>
        <div class="texttabs" role="tablist" style="margin-top: 12px">
          <button class="texttab" role="tab" :aria-selected="tab === 'all'" @click="show('all')">All</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'unreviewed'" @click="show('unreviewed')">Unreviewed</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'reviewed'" @click="show('reviewed')">Reviewed</button>
        </div>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!items.length" :title="`No ${String(tab)} errors`" text="Client-side errors appear here." />
        <ul v-else class="list">
          <li v-for="c in items" :key="c.id" class="s">
            <div class="row between">
              <div>
                <strong>{{ c.path }}</strong>
                <span class="badge">{{ label(c.method) }}</span>
              </div>
              <span class="status" :class="c.reviewed ? 'good' : 'bad'">{{ c.reviewed ? 'reviewed' : 'unreviewed' }}</span>
            </div>
            <div class="small muted">{{ c.message }}</div>
            <div class="small muted">{{ c.person?.name ?? 'Unknown'}} · {{ c.userAgent ? c.userAgent.slice(0, 40) : 'unknown' }} · {{ when(c.createdAt) }}</div>
            <div class="btns">
              <button v-if="!c.reviewed" class="btn btn-line small-btn" @click="markReviewed(c, true)">Mark reviewed</button>
              <button v-if="c.reviewed" class="btn btn-line small-btn" @click="markReviewed(c, false)">Unreview</button>
              <button class="btn btn-line small-btn" @click="remove(c)">Delete</button>
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
