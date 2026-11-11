<script setup lang="ts">
/** A person's picture, or their initials on a tinted disc when they have none. */
import { computed } from 'vue';
import { monogram } from '../lib/format';
const props = defineProps<{ name: string; src?: string | null; size?: number }>();
const px = computed(() => `${props.size ?? 40}px`);
</script>

<template>
  <span class="av" :style="{ width: px, height: px, fontSize: `${(props.size ?? 40) * 0.38}px` }">
    <img v-if="src" :src="src" :alt="name" loading="lazy" />
    <template v-else>{{ monogram(name || '?') }}</template>
  </span>
</template>

<style scoped>
.av {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: var(--ink-wash);
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 700;
  overflow: hidden;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
