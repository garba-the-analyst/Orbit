<script setup lang="ts">
/** Shown wherever money is involved while payments are simulated, so nobody mistakes the pilot for real billing. */
import { useAppConfig } from '../stores/appConfig';
const cfg = useAppConfig();
</script>

<template>
  <p v-if="cfg.config.testMode" class="notice warn test"><strong>Test mode.</strong> Payments are simulated. No real money moves.</p>
</template>

<style scoped>
.test {
  margin: 0;
}
</style>
