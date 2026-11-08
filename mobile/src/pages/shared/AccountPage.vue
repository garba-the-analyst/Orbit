<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue';
import AccountPanel from '../../components/AccountPanel.vue';
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <main class="screen root"><AccountPanel /></main>
    </ion-content>
  </ion-page>
</template>
