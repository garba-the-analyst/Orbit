<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonToolbar, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/endpoints';
import type { Shop } from '../../api/types';
import EmptyState from '../../components/EmptyState.vue';
import ShopSign from '../../components/ShopSign.vue';
import Skeleton from '../../components/Skeleton.vue';
import { errorMessage } from '../../lib/ui';

const router = useRouter();
const shops = ref<Shop[]>([]);
const loading = ref(true);
const error = ref('');
onIonViewWillEnter(async () => {
  try {
    shops.value = await api.favourites();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border"><ion-toolbar><ion-buttons slot="start"><ion-back-button default-href="/c/shops" text="" /></ion-buttons></ion-toolbar></ion-header>
    <ion-content :fullscreen="true">
      <main class="screen">
        <h1 class="title">Saved shops</h1>
        <Skeleton v-if="loading" kind="rows" />
        <p v-else-if="error" class="notice bad">{{ error }}</p>
        <EmptyState v-else-if="!shops.length" title="No saved shops" text="Tap the heart on a shop to keep it here.">
          <button class="btn btn-primary" @click="router.replace('/c/shops')">Browse shops</button>
        </EmptyState>
        <ul v-else class="list">
          <li v-for="s in shops" :key="s.id" style="padding: 0">
            <button class="rowlink" style="padding: 14px 0; gap: 14px" @click="router.push(`/c/shop/${s.id}`)">
              <ShopSign :name="s.name" :color="s.color" :size="52" />
              <span class="grow left"><strong>{{ s.name }}</strong><br /><span class="small muted">{{ s.category }} · {{ s.city }}</span></span>
            </button>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>
