<script setup lang="ts">
/**
 * Bottom sheet where a shop or rider types the customer's 4-digit PIN to confirm a handover.
 * The parent owns the request; this sheet only collects the digits and shows the result.
 */
import { IonModal } from '@ionic/vue';
import { ref, watch } from 'vue';
import PinEntry from './PinEntry.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  subtitle: string;
  confirm: string;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ close: []; submit: [pin: string] }>();

const pin = ref('');
const entry = ref<InstanceType<typeof PinEntry> | null>(null);

watch(
  () => props.open,
  (o) => {
    if (o) pin.value = '';
  },
);
watch(
  () => props.error,
  (e) => {
    if (e) {
      pin.value = '';
      entry.value?.focus();
    }
  },
);
</script>

<template>
  <ion-modal
    class="sheet"
    :is-open="open"
    :initial-breakpoint="0.62"
    :breakpoints="[0, 0.62, 0.9]"
    @didPresent="entry?.focus()"
    @didDismiss="emit('close')"
  >
    <div class="body">
      <h2 class="title-sm" style="margin: 8px 0 4px">{{ title }}</h2>
      <p class="small muted" style="margin: 0 0 20px">{{ subtitle }}</p>
      <PinEntry ref="entry" v-model="pin" :invalid="!!error" :disabled="busy" @complete="emit('submit', $event)" />
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="btn btn-primary block" style="margin-top: 20px" :disabled="pin.length !== 4 || busy" @click="emit('submit', pin)">
        {{ busy ? 'Checking…' : confirm }}
      </button>
      <button class="btn btn-text block" @click="emit('close')">Not yet</button>
    </div>
  </ion-modal>
</template>

<style scoped>
.body {
  padding: 20px var(--gutter) calc(24px + env(safe-area-inset-bottom));
}
.error-text {
  margin: 12px 0 0;
  color: var(--bad);
  font-size: var(--t-sm);
  line-height: 1.4;
}
</style>
