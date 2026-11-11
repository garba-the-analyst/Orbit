<script setup lang="ts">
/** The notification bell with an unread badge. Place it in a page header. */
import { IonIcon } from '@ionic/vue';
import { notificationsOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useNotifications } from '../stores/notifications';
const n = useNotifications();
const router = useRouter();
</script>

<template>
  <button class="bell" type="button" data-tour="bell" :aria-label="n.unread ? `${n.unread} unread notifications` : 'Notifications'" @click="router.push('/n')">
    <ion-icon :icon="notificationsOutline" />
    <span v-if="n.unread" class="dot">{{ n.unread > 9 ? '9+' : n.unread }}</span>
  </button>
</template>

<style scoped>
.bell {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 20px;
  display: grid;
  place-items: center;
  transition: transform var(--dur-1) var(--ease);
}
.bell:active {
  transform: scale(0.92);
}
.dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--bad);
  color: #fff;
  font: 700 11px/18px var(--font-display);
  animation: pop 0.35s var(--ease);
}
@keyframes pop {
  from {
    transform: scale(0);
  }
}
</style>
