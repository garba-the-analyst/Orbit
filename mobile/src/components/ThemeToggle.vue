<script setup lang="ts">
/** Cycles light, dark, and follow-phone. The icon shows the current choice. */
import { IonIcon } from '@ionic/vue';
import { contrastOutline, moonOutline, sunnyOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useTheme } from '../stores/theme';
import { toast } from '../lib/ui';

const theme = useTheme();
const icon = computed(() => (theme.pref === 'dark' ? moonOutline : theme.pref === 'light' ? sunnyOutline : contrastOutline));
const label = computed(() => ({ system: 'Following your phone', light: 'Light mode', dark: 'Dark mode' })[theme.pref]);

function cycle() {
  const next = theme.pref === 'system' ? 'light' : theme.pref === 'light' ? 'dark' : 'system';
  theme.set(next);
  toast(({ system: 'Following your phone', light: 'Light mode', dark: 'Dark mode' } as const)[next]);
}
</script>

<template>
  <button class="tt" type="button" data-tour="theme" :aria-label="`Theme: ${label}. Tap to change.`" @click="cycle">
    <ion-icon :icon="icon" />
  </button>
</template>

<style scoped>
.tt {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 20px;
  display: grid;
  place-items: center;
  transition: transform var(--dur-2) var(--ease);
}
.tt:active {
  transform: rotate(40deg) scale(0.9);
}
</style>
