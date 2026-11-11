<script setup lang="ts">
/** SOS alerts raised during trips. Open ones are urgent: call the person, then resolve with a note. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { SosItem } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import { when } from '../../lib/format';
import { errorMessage, promptText, showError, success, toast } from '../../lib/ui';
import { useBadges } from '../../stores/badges';

const badges = useBadges();
const tab = ref<'OPEN' | 'RESOLVED'>('OPEN');
const items = ref<SosItem[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  error.value = '';
  try {
    items.value = await api.admin.sos(tab.value);
    if (tab.value === 'OPEN') badges.adminSos = items.value.length;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
useLive(['admin.changed', 'trip.updated'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}
function show(t: 'OPEN' | 'RESOLVED') {
  tab.value = t;
  loading.value = true;
  load();
}
async function resolve(s: SosItem) {
  const note = await promptText({ title: 'Resolve this alert', message: 'What was done? This is kept in the safety record.', placeholder: 'Called the rider, all safe', confirm: 'Mark resolved' });
  if (!note) return;
  try {
    await api.admin.resolveSos(s.id, note);
    success();
    toast('Alert resolved.');
    load();
  } catch (e) {
    await showError(e);
  }
}
const map = (s: SosItem) => `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`;
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title" data-tour="admin-safety">Safety</h1>
        <div class="texttabs" role="tablist" style="margin-top: 12px">
          <button class="texttab" role="tab" :aria-selected="tab === 'OPEN'" @click="show('OPEN')">Open</button>
          <button class="texttab" role="tab" :aria-selected="tab === 'RESOLVED'" @click="show('RESOLVED')">Resolved</button>
        </div>
        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!items.length" :title="tab === 'OPEN' ? 'No open alerts' : 'Nothing resolved yet'" text="SOS alerts from riders and customers appear here instantly." />
        <ul v-else class="list">
          <li v-for="s in items" :key="s.id" class="s">
            <div class="row between"><strong>{{ s.person?.name ?? 'Unknown' }} <span class="muted">({{ s.raisedBy.toLowerCase() }})</span></strong><span class="status" :class="s.status === 'OPEN' ? 'bad' : 'good'">{{ s.status.toLowerCase() }}</span></div>
            <div class="small"><a v-if="s.person?.phone" :href="`tel:${s.person.phone}`">{{ s.person.phone }}</a> · {{ when(s.at) }}</div>
            <div v-if="s.trip" class="small muted">Trip {{ s.trip.code }} · {{ s.trip.status.toLowerCase() }} · {{ s.trip.pickup }} → {{ s.trip.drop }}</div>
            <div v-if="s.note" class="small">“{{ s.note }}”</div>
            <div class="btns">
              <a v-if="s.lat != null" class="btn btn-line small-btn" :href="map(s)" target="_blank" rel="noopener">Open location</a>
              <button v-if="s.status === 'OPEN'" class="btn btn-primary small-btn" @click="resolve(s)">Resolve</button>
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
  gap: 4px;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
</style>
