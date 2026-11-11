<script setup lang="ts">
/** The notification that slides down from the top while the app is open. Tap to go to the thing it is about. */
import { IonIcon } from '@ionic/vue';
import { notificationsOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useNotifications } from '../stores/notifications';
import { routeForNotification } from '../lib/notify';
import { useAuth } from '../stores/auth';

const n = useNotifications();
const auth = useAuth();
const router = useRouter();

function open() {
  const b = n.banner;
  if (!b) return;
  n.dismissBanner();
  n.markRead([b.id]).catch(() => undefined);
  router.push(routeForNotification(b, auth.role));
}
</script>

<template>
  <Transition name="drop">
    <button v-if="n.banner" class="banner" type="button" @click="open">
      <span class="ico"><ion-icon :icon="notificationsOutline" /></span>
      <span class="txt">
        <strong>{{ n.banner.title }}</strong>
        <span>{{ n.banner.body }}</span>
      </span>
    </button>
  </Transition>
</template>

<style scoped>
.banner {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100% - 24px), 456px);
  z-index: 99980;
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-lg);
}
.ico {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--signal);
  color: var(--on-signal);
  font-size: 20px;
}
.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--t-sm);
  color: var(--slate);
}
.txt strong {
  color: var(--ink);
  font-family: var(--font-display);
}
.drop-enter-active,
.drop-leave-active {
  transition: transform 0.4s var(--ease), opacity 0.3s;
}
.drop-enter-from,
.drop-leave-to {
  transform: translate(-50%, -140%);
  opacity: 0;
}
</style>
