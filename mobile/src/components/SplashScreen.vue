<script setup lang="ts">
/**
 * The loading screen: the ORBIT ring draws itself, the satellite drops in and starts circling, the wordmark
 * rises letter by letter, and a thin bar fills while the app wakes the server. It stays at least ~1.4 s so the
 * animation finishes, then fades away once the app is ready (the parent controls `done`).
 */
import OrbitMark from './OrbitMark.vue';
defineProps<{ done: boolean; slow?: boolean }>();
</script>

<template>
  <Transition name="splash">
    <div v-if="!done" class="splash" role="status" aria-live="polite" aria-label="Loading ORBIT">
      <div class="stars" aria-hidden="true">
        <i v-for="n in 14" :key="n" :style="{ '--i': n }"></i>
      </div>
      <div class="center">
        <OrbitMark :size="112" animate="draw" />
        <div class="word" aria-hidden="true">
          <span v-for="(c, i) in 'ORBIT'.split('')" :key="i" :style="{ '--d': `${0.9 + i * 0.07}s` }">{{ c }}</span>
        </div>
        <p class="tag">Rides · Deliveries · Freight · Shops</p>
      </div>
      <div class="foot">
        <div class="bar"><span></span></div>
        <p class="note">{{ slow ? 'Waking up the server. This can take a few seconds…' : 'Getting things ready' }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(120% 90% at 50% 30%, var(--ink-wash) 0%, var(--paper) 62%);
  color: var(--ink);
  overflow: hidden;
}
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
.word {
  display: flex;
  font: 700 2.1rem/1 var(--font-display);
  letter-spacing: 0.22em;
  margin-right: -0.22em;
}
.word span {
  opacity: 0;
  transform: translateY(14px);
  animation: rise 0.6s var(--ease) var(--d) forwards;
}
@keyframes rise {
  to {
    opacity: 1;
    transform: none;
  }
}
.tag {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--slate);
  letter-spacing: 0.04em;
  opacity: 0;
  animation: rise 0.7s var(--ease) 1.5s forwards;
}
.foot {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 44px);
  width: min(260px, 70vw);
  text-align: center;
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  width: 40%;
  border-radius: 2px;
  background: var(--signal);
  animation: slide 1.3s var(--ease) infinite;
}
@keyframes slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}
.note {
  margin: 12px 0 0;
  font-size: var(--t-xs);
  color: var(--slate);
}
/* A few slow-drifting stars: depth without noise. */
.stars i {
  position: absolute;
  left: calc((var(--i) * 53 % 100) * 1%);
  top: calc((var(--i) * 37 % 100) * 1%);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--signal);
  opacity: 0;
  animation: twinkle 3.2s ease-in-out calc(var(--i) * 0.23s) infinite;
}
@keyframes twinkle {
  50% {
    opacity: 0.55;
    transform: scale(1.6);
  }
}
.splash-leave-active {
  transition: opacity 0.45s var(--ease), transform 0.45s var(--ease);
}
.splash-leave-to {
  opacity: 0;
  transform: scale(1.04);
}
</style>
