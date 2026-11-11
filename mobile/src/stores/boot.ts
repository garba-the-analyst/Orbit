import { defineStore } from 'pinia';
import { ref } from 'vue';

/** True once the saved session and public settings have loaded; the splash screen stays up until then. */
export const useBoot = defineStore('boot', () => {
  const ready = ref(false);
  return { ready };
});
