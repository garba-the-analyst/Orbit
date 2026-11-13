<script setup lang="ts">
/** A small, always-visible "Demo" pill so nobody mistakes the demo build for the real service. */
import { DEMO } from '../api/demo/flag';
</script>

<template>
  <div v-if="DEMO" class="demo-badge" role="note">Demo mode · sample data on this device</div>
</template>

<style scoped>
.demo-badge {
  position: fixed;
  z-index: 9998;
  left: 50%;
  top: calc(env(safe-area-inset-top, 0px) + 1px);
  transform: translateX(-50%);
  padding: 1px 10px;
  border-radius: 999px;
  background: var(--signal);
  color: var(--on-signal);
  font: 700 10px var(--font-display);
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0.92;
  box-shadow: var(--shadow-sm);
}
</style>
