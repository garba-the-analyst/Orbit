<script setup lang="ts">
/** Simple line icons for every vehicle ORBIT supports. They inherit the text colour. */
defineProps<{ type: string; size?: number }>();
</script>

<template>
  <svg :width="size ?? 40" :height="size ?? 40" viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="type === 'BICYCLE'">
      <circle cx="11" cy="22" r="7" /><circle cx="37" cy="22" r="7" /><path d="M11 22l7-12h10l9 12M18 10l8 12M26 22l-3-12M25 6h6" />
    </template>
    <template v-else-if="type === 'MOTORCYCLE'">
      <circle cx="10" cy="23" r="6" /><circle cx="38" cy="23" r="6" /><path d="M10 23l8-9h8l5 9M26 14l-3-6h-5M31 9l4 1 3 13M16 23h14" />
    </template>
    <template v-else-if="type === 'KEKE'">
      <circle cx="12" cy="25" r="4.5" /><circle cx="36" cy="25" r="4.5" /><path d="M5 25V12l9-6h20l7 8v11M5 14h36M24 6v8M16 25h16" />
    </template>
    <template v-else-if="type === 'CAR'">
      <circle cx="13" cy="24" r="4" /><circle cx="35" cy="24" r="4" /><path d="M5 24v-7l5-2 6-7h14l6 7 6 2v7h-4M17 24h14M5 24h4M16 15h18M24 8v7" />
    </template>
    <template v-else-if="type === 'VAN'">
      <circle cx="13" cy="25" r="4" /><circle cx="36" cy="25" r="4" /><path d="M4 25V9h26v16M30 14h8l6 7v4h-3M17 25h15M4 25h5" />
    </template>
    <template v-else-if="type === 'TRUCK'">
      <circle cx="12" cy="26" r="4" /><circle cx="36" cy="26" r="4" /><path d="M3 26V8h24v18M27 13h9l7 8v5h-3M16 26h16M3 26h5" />
    </template>
    <template v-else-if="type === 'LORRY'">
      <circle cx="10" cy="26" r="3.5" /><circle cx="19" cy="26" r="3.5" /><circle cx="38" cy="26" r="3.5" /><path d="M2 26V6h28v20M30 12h8l7 8v6M14 26h0M23 26h11" />
    </template>
    <template v-else>
      <circle cx="9" cy="26" r="3" /><circle cx="16" cy="26" r="3" /><circle cx="25" cy="26" r="3" /><circle cx="32" cy="26" r="3" /><circle cx="42" cy="26" r="3" /><path d="M2 23V5h27v18M29 11h6l6 7v5M7 23h0M19 26h3M35 26h4" />
    </template>
  </svg>
</template>
