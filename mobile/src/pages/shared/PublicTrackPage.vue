<script setup lang="ts">
/** What a friend sees from a shared trip link: status and the driver's first name. No account needed, no contact details. */
import { IonContent, IonPage } from '@ionic/vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../api/endpoints';
import type { PublicTrack } from '../../api/types';
import OrbitMark from '../../components/OrbitMark.vue';
import { errorMessage } from '../../lib/ui';

const route = useRoute();
const t = ref<(PublicTrack & Record<string, any>) | null>(null);
const error = ref('');
let timer: ReturnType<typeof setInterval>;
async function load() {
  try {
    t.value = (await api.publicTrack(String(route.params.token))) as never;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(() => {
  load();
  timer = setInterval(load, 10_000);
});
onBeforeUnmount(() => clearInterval(timer));
const LABEL: Record<string, string> = { SEARCHING: 'Looking for a driver', ACCEPTED: 'Driver is on the way to pick up', ARRIVED: 'Driver has arrived at pickup', IN_PROGRESS: 'On the way', COMPLETED: 'Trip finished', CANCELLED: 'Trip cancelled', NO_DRIVER: 'No driver found' };
</script>

<template>
  <ion-page>
    <ion-content>
      <main class="screen pt">
        <OrbitMark :size="56" animate="orbit" />
        <h1 class="title">Following a trip</h1>
        <p v-if="error" class="notice bad">{{ error }}</p>
        <template v-else-if="t">
          <p class="big">{{ LABEL[t.status] ?? t.status }}</p>
          <p v-if="t.driver" class="muted">Driver: {{ t.driver.firstName }}<template v-if="t.driver.rating"> · ★ {{ t.driver.rating }}</template></p>
          <p v-if="t.pickup || t.drop" class="small muted">{{ t.pickup?.address ?? t.pickup }} → {{ t.drop?.address ?? t.drop }}</p>
          <p class="xsmall muted">This page updates by itself. The link stops working shortly after the trip ends.</p>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding-top: 64px;
}
.big {
  font: 700 var(--t-xl) var(--font-display);
  margin: 12px 0 0;
}
</style>
