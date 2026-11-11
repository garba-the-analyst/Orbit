<script setup lang="ts">
/** An empty screen is an invitation to act: say what is missing and what to do next. */
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <div class="empty">
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" style="color: var(--slate-faint)">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="3 9" stroke-linecap="round" />
      <circle cx="47.6" cy="16.4" r="6" fill="#ffc400" stroke="currentColor" stroke-width="2.5" style="color: var(--ink)" />
    </svg>
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <div class="action"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
}
h3 {
  margin: 16px 0 6px;
  font: 600 var(--t-lg) / 1.25 var(--font-display);
  letter-spacing: -0.015em;
}
p {
  margin: 0;
  max-width: 34ch;
  color: var(--slate);
  font-size: var(--t-md);
  line-height: 1.5;
}
.action {
  margin-top: 20px;
}
.action:empty {
  display: none;
}
</style>
