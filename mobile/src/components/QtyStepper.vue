<script setup lang="ts">
import { add, remove } from 'ionicons/icons';
import { IonIcon } from '@ionic/vue';
import { tap } from '../lib/ui';

const props = defineProps<{ qty: number; max: number; label: string }>();
const emit = defineEmits<{ change: [qty: number] }>();

function set(n: number) {
  tap();
  emit('change', n);
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="`Quantity of ${label}`">
    <template v-if="qty > 0">
      <button type="button" :aria-label="`Remove one ${label}`" @click="set(qty - 1)">
        <ion-icon :icon="remove" />
      </button>
      <span class="q num" aria-live="polite">{{ qty }}</span>
    </template>
    <button
      type="button"
      class="plus"
      :class="{ solo: qty === 0 }"
      :aria-label="`Add one ${label}`"
      :disabled="qty >= max"
      @click="set(qty + 1)"
    >
      <ion-icon :icon="add" />
      <span v-if="qty === 0" class="add-text">Add</span>
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
button {
  appearance: none;
  border: 0;
  height: 44px;
  min-width: 44px;
  border-radius: 12px;
  background: var(--ink-wash);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font: 600 var(--t-sm) / 1 var(--font-display);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button ion-icon {
  font-size: 20px;
}
button:active:not(:disabled) {
  transform: scale(0.96);
}
button:disabled {
  opacity: 0.35;
}
.plus {
  background: var(--ink);
  color: var(--on-ink);
}
.plus.solo {
  background: var(--signal);
  color: var(--on-signal);
  padding: 0 14px 0 10px;
}
.q {
  min-width: 34px;
  text-align: center;
  font: 600 var(--t-md) / 1 var(--font-display);
}
</style>
