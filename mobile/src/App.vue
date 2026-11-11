<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLive } from './api/socket';
import { useAuth } from './stores/auth';
import { useBoot } from './stores/boot';
import { useNotifications } from './stores/notifications';
import { useDriver } from './stores/driver';
import SplashScreen from './components/SplashScreen.vue';
import StatusBanners from './components/StatusBanners.vue';
import InAppBanner from './components/InAppBanner.vue';

const auth = useAuth();
const boot = useBoot();
const notes = useNotifications();
const router = useRouter();
const driver = useDriver();

// If the server is cold (free hosting sleeps), say so after a few seconds instead of leaving a silent screen.
const slow = ref(false);
const slowTimer = setTimeout(() => (slow.value = true), 4000);
onBeforeUnmount(() => clearTimeout(slowTimer));
watch(() => boot.ready, () => (slow.value = false));

/** If the session ends for any reason (sign out, expired, suspended), go to the sign-in screen. */
watch(
  () => auth.user,
  (u) => {
    if (!u) {
      notes.reset();
      driver.reset();
      if (router.currentRoute.value.path !== '/auth' && !router.currentRoute.value.path.startsWith('/track/')) router.replace('/auth');
    } else {
      notes.refreshCount();
      driver.sync();
    }
  },
);

onMounted(() => {
  if (auth.isSignedIn) notes.refreshCount();
});

notes.listen();
useLive(['connect'], () => auth.isSignedIn && notes.refreshCount());

/** Admin approval or suspension arrives instantly; refresh the account so the app reacts. */
useLive(['account.updated'], async () => {
  if (!auth.isSignedIn) return;
  try {
    const before = auth.user?.status;
    const u = await auth.refresh();
    if (before !== u.status) router.replace(auth.isPending ? '/pending' : auth.home);
  } catch {
    /* a 401 here already signed the person out */
  }
});
</script>

<template>
  <ion-app>
    <ion-router-outlet />
    <StatusBanners />
    <InAppBanner />
  </ion-app>
  <SplashScreen :done="boot.ready" :slow="slow" />
</template>
