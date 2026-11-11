<script setup lang="ts">
/** A slim bar that slides in from the top when the phone goes offline, and confirms when it comes back. */
import { onBeforeUnmount, onMounted, ref } from 'vue';

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const justBack = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const down = () => {
  online.value = false;
  justBack.value = false;
  clearTimeout(timer);
};
const up = () => {
  online.value = true;
  justBack.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (justBack.value = false), 2500);
};
onMounted(() => {
  window.addEventListener('offline', down);
  window.addEventListener('online', up);
});
onBeforeUnmount(() => {
  window.removeEventListener('offline', down);
  window.removeEventListener('online', up);
  clearTimeout(timer);
});
</script>

<template>
  <Transition name="bar">
    <div v-if="!online || justBack" class="bar" :class="{ ok: online }" role="status">
      {{ online ? 'Back online' : 'You are offline. Some things will not update.' }}
    </div>
  </Transition>
</template>

<style scoped>
.bar {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(100%, 480px);
  z-index: 99990;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px;
  background: var(--bad);
  color: var(--on-ink);
  text-align: center;
  font: 600 var(--t-sm) / 1.3 var(--font-display);
}
.bar.ok {
  background: var(--good);
}
.bar-enter-active,
.bar-leave-active {
  transition: transform 0.3s var(--ease), opacity 0.3s;
}
.bar-enter-from,
.bar-leave-to {
  transform: translate(-50%, -100%);
  opacity: 0;
}
</style>
