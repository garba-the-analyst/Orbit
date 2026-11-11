<script setup lang="ts">
/** Every notification, newest first. Tap one to jump to the order or trip it is about. */
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonRefresher, IonRefresherContent, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { useRouter } from 'vue-router';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import { ago } from '../../lib/format';
import { routeForNotification } from '../../lib/notify';
import { showError } from '../../lib/ui';
import { useAuth } from '../../stores/auth';
import { useNotifications } from '../../stores/notifications';
import type { NotificationView } from '../../api/types';
import { ref } from 'vue';

const n = useNotifications();
const auth = useAuth();
const router = useRouter();
const first = ref(true);

onIonViewWillEnter(async () => {
  try {
    await n.load();
  } catch (e) {
    showError(e);
  } finally {
    first.value = false;
  }
});

async function refresher(ev: CustomEvent) {
  await n.load().catch(() => undefined);
  (ev.target as HTMLIonRefresherElement).complete();
}
async function open(x: NotificationView) {
  if (!x.read) n.markRead([x.id]).catch(() => undefined);
  router.push(routeForNotification(x, auth.role));
}
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button :default-href="auth.home" text="" /></ion-buttons>
        <ion-buttons slot="end">
          <button v-if="n.unread" class="btn-text" type="button" @click="n.markRead()">Mark all read</button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen">
        <h1 class="title">Notifications</h1>
        <Skeleton v-if="first && !n.items.length" kind="rows" />
        <EmptyState v-else-if="!n.items.length" title="You are all caught up" text="Trip updates, order progress and account news show up here." />
        <ul v-else class="list">
          <li v-for="(x, i) in n.items" :key="x.id" style="padding: 0" :style="{ '--n': i }" class="item">
            <button class="rowlink row-n" type="button" @click="open(x)">
              <i class="dot" :class="{ on: !x.read }"></i>
              <span class="grow left"><strong>{{ x.title }}</strong><span class="small muted body">{{ x.body }}</span></span>
              <span class="xsmall muted">{{ ago(x.createdAt) }}</span>
            </button>
          </li>
        </ul>
        <button v-if="n.items.length" class="btn btn-line block" style="margin-top: 20px" type="button" @click="n.clearAll()">Clear all</button>
        <button v-if="n.items.length < n.total" class="btn btn-quiet block" style="margin-top: 8px" type="button" @click="n.load(false)">Load older</button>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.item {
  animation: rise 0.35s var(--ease) calc(var(--n) * 30ms) both;
}
.row-n {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 0;
  width: 100%;
  text-align: left;
}
.left {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.body {
  margin-top: 2px;
}
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background: transparent;
}
.dot.on {
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--ink);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
