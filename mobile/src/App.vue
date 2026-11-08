<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLive } from './api/socket';
import { useAuth } from './stores/auth';

const auth = useAuth();
const router = useRouter();

/** If the session ends for any reason (sign out, expired, suspended), go to the sign-in screen. */
watch(
  () => auth.user,
  (u) => {
    if (!u && router.currentRoute.value.path !== '/auth') router.replace('/auth');
  },
);

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
  </ion-app>
</template>
