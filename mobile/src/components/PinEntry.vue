<script setup lang="ts">
/**
 * Four-digit PIN entry for merchants and riders confirming a handover.
 * One real (invisible) numeric input sits over four boxes, so the OS number pad, paste and
 * screen readers all work normally.
 */
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{ modelValue: string; invalid?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; complete: [value: string] }>();

const input = ref<HTMLInputElement | null>(null);
const digits = computed(() => Array.from({ length: 4 }, (_, i) => props.modelValue[i] ?? ''));

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
  (e.target as HTMLInputElement).value = value;
  emit('update:modelValue', value);
  if (value.length === 4) emit('complete', value);
}

function focus() {
  nextTick(() => input.value?.focus());
}
defineExpose({ focus });
</script>

<template>
  <div class="pin" :class="{ invalid }" @click="focus">
    <input
      ref="input"
      :value="modelValue"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="4"
      autocomplete="one-time-code"
      aria-label="4-digit delivery PIN"
      :disabled="disabled"
      @input="onInput"
    />
    <div v-for="(d, i) in digits" :key="i" class="box" :class="{ on: i === modelValue.length }">
      {{ d }}
    </div>
  </div>
</template>

<style scoped>
.pin {
  position: relative;
  display: flex;
  gap: 10px;
}
input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  font-size: 16px; /* prevents iOS zoom */
  cursor: pointer;
}
.box {
  flex: 1;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  font: 600 2rem / 1 var(--font-display);
  font-variant-numeric: tabular-nums;
}
.box.on {
  border-color: var(--ink);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.invalid .box {
  border-color: var(--bad);
}
.pin:focus-within .box.on {
  border-color: var(--ink);
}
</style>
