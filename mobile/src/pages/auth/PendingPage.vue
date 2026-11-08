<script setup lang="ts">
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import OrbitMark from '../../components/OrbitMark.vue';
import { useLive } from '../../api/socket';
import { VEHICLE_LABEL } from '../../lib/format';
import { showError, toast } from '../../lib/ui';
import { useAuth } from '../../stores/auth';

const auth = useAuth();
const router = useRouter();
const checking = ref(false);

const isMerchant = computed(() => auth.role === 'MERCHANT');
const checks = computed(() =>
  isMerchant.value
    ? ['That you own and run the shop', 'The shop’s address and what it sells', 'That nothing on the prohibited goods list is for sale']
    : ['Your identity and phone number', `Your ${VEHICLE_LABEL[auth.user?.vehicle ?? 'MOTORCYCLE'].toLowerCase()} and riding documents`, 'That you have read the safety rules'],
);

async function check(silent = false) {
  checking.value = true;
  try {
    const u = await auth.refresh();
    if (u.status === 'ACTIVE') {
      toast('You are verified. Welcome to ORBIT.');
      await router.replace(auth.home);
    } else if (!silent) {
      toast('Still waiting. We will notify you here as soon as you are approved.');
    }
  } catch (e) {
    if (!silent) await showError(e);
  } finally {
    checking.value = false;
  }
}

async function refresher(ev: CustomEvent) {
  await check(true);
  (ev.target as HTMLIonRefresherElement).complete();
}

onIonViewWillEnter(() => check(true));
useLive(['account.updated'], () => check(true));

async function signOut() {
  auth.logout();
  await router.replace('/auth');
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen pending">
        <OrbitMark :size="44" />
        <h1 class="title">You are in the queue, {{ auth.user?.name.split(' ')[0] }}.</h1>
        <p class="lede">
          {{ isMerchant ? 'Before your shop goes live,' : 'Before your first job,' }}
          an ORBIT team member checks your details. This keeps buyers and riders safe.
        </p>

        <h2 class="heading" style="margin-top: 28px">What we check</h2>
        <ul class="list checks">
          <li v-for="c in checks" :key="c">{{ c }}</li>
        </ul>

        <div v-if="isMerchant && auth.user?.shop" class="notice" style="margin-top: 20px">
          <span class="strong">{{ auth.user.shop.name }}</span> is saved. You can add products as soon as you are approved.
        </div>

        <div class="stack" style="margin-top: 28px; --stack: 8px">
          <button class="btn btn-ink block" :disabled="checking" @click="check(false)">
            {{ checking ? 'Checking…' : 'Check my status' }}
          </button>
          <button class="btn btn-text block" @click="signOut">Sign out</button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.pending {
  padding-top: calc(var(--ion-safe-area-top, 0px) + 28px);
}
.checks li {
  padding: 12px 0 12px 28px;
  position: relative;
  line-height: 1.4;
}
.checks li::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 19px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 1.5px var(--ink);
}
</style>
