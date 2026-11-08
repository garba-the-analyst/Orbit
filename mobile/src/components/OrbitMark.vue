<script setup lang="ts">
/** The ORBIT brand mark: a ring with a yellow satellite. Also the shape of the order tracker. */
withDefaults(defineProps<{ size?: number; tone?: 'ink' | 'light' }>(), { size: 40, tone: 'ink' });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="ORBIT">
    <circle cx="32" cy="32" r="22" fill="none" :stroke="tone === 'ink' ? '#161a52' : '#ffffff'" stroke-width="6" />
    <circle cx="47.6" cy="16.4" r="8" fill="#ffc400" :stroke="tone === 'ink' ? '#f4f5f9' : '#161a52'" stroke-width="3" />
  </svg>
</template>
