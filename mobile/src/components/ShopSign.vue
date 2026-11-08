<script setup lang="ts">
/**
 * A shop's sign: its monogram on its own sign colour, like the painted fascia on a real shop.
 * Colour is the one thing that varies per shop; everything else stays on the ORBIT system.
 */
import { computed } from 'vue';
import { inkOn, monogram } from '../lib/format';

const props = withDefaults(defineProps<{ name: string; color: string; size?: number }>(), { size: 52 });
const letters = computed(() => monogram(props.name));
const ink = computed(() => inkOn(props.color));
</script>

<template>
  <div
    class="sign"
    :style="{ width: `${size}px`, height: `${size}px`, background: color, color: ink, fontSize: `${size * 0.38}px` }"
    aria-hidden="true"
  >
    {{ letters }}
  </div>
</template>

<style scoped>
.sign {
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-sign);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
}
</style>
