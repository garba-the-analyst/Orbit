<script setup lang="ts">
import { IonContent, IonIcon, IonPage } from '@ionic/vue';
import { chevronForward, peopleOutline, pricetagOutline, receiptOutline, personCircleOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useAuth } from '../../stores/auth';

const auth = useAuth();
const links = computed(() => [
  { to: '/a/orders', icon: receiptOutline, title: 'Shop orders', text: 'Every marketplace order, with PIN unlock.' },
  { to: '/a/promos', icon: pricetagOutline, title: 'Promo codes', text: 'Create and switch off discounts for trips.' },
  ...(auth.user?.isSuperAdmin ? [{ to: '/a/admins', icon: peopleOutline, title: 'Admin team', text: 'Add or remove the people who run ORBIT.' }] : []),
  { to: '/a/account', icon: personCircleOutline, title: 'My account', text: 'Password, theme and sign out.' },
]);
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root">
        <h1 class="title">More</h1>
        <ul class="list" style="margin-top: 12px">
          <li v-for="l in links" :key="l.to" style="padding: 0">
            <router-link :to="l.to" class="rowlink">
              <ion-icon :icon="l.icon" class="ic" aria-hidden="true" />
              <span class="grow"><strong>{{ l.title }}</strong><span class="small muted block">{{ l.text }}</span></span>
              <ion-icon :icon="chevronForward" aria-hidden="true" />
            </router-link>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.rowlink {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 0;
  color: inherit;
  text-decoration: none;
}
.ic {
  font-size: 24px;
  color: var(--ink);
}
.block {
  display: block;
}
</style>
