<script setup lang="ts">
/**
 * The ORBIT brand mark: a ring with a yellow satellite.
 *  - animate="none"   static (default)
 *  - animate="orbit"  the satellite circles the ring, continuously (loading states)
 *  - animate="draw"   the ring draws itself, then the satellite drops into place (splash intro)
 *  - animate="pulse"  a soft ripple leaves the ring (searching, waiting)
 * The satellite's travel is a rotation of a group around the ring's centre, so it is one cheap transform.
 */
withDefaults(defineProps<{ size?: number; tone?: 'ink' | 'light'; animate?: 'none' | 'orbit' | 'draw' | 'pulse' }>(), {
  size: 40,
  tone: 'ink',
  animate: 'none',
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="ORBIT" class="mark" :class="[`a-${animate}`, `t-${tone}`]">
    <circle v-if="animate === 'pulse'" class="ripple r1" cx="32" cy="32" r="22" />
    <circle v-if="animate === 'pulse'" class="ripple r2" cx="32" cy="32" r="22" />
    <circle class="ring" cx="32" cy="32" r="22" fill="none" stroke-width="6" pathLength="100" />
    <g class="sat">
      <circle class="dot" cx="47.6" cy="16.4" r="8" fill="#ffc400" stroke-width="3" />
    </g>
  </svg>
</template>

<style scoped>
.mark {
  overflow: visible;
  display: block;
}
.ring {
  stroke: #161a52;
}
.dot {
  stroke: var(--paper, #f4f5f9);
}
.t-light .ring {
  stroke: #ffffff;
}
.t-light .dot {
  stroke: #161a52;
}
/* On a dark screen the ink ring would vanish, so the ink tone follows the theme. */
:root[data-theme='dark'] .t-ink .ring {
  stroke: #e8eaff;
}
.sat {
  transform-origin: 32px 32px;
  transform-box: view-box;
}
.a-orbit .sat {
  animation: orbit 2.4s linear infinite;
}
@keyframes orbit {
  to {
    transform: rotate(360deg);
  }
}
.a-draw .ring {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: draw 0.9s var(--ease, ease-out) 0.1s forwards;
  transform-origin: 32px 32px;
  transform: rotate(-90deg);
}
.a-draw .sat {
  opacity: 0;
  animation: drop 0.55s var(--ease, ease-out) 0.85s forwards, orbit 2.4s linear 1.4s infinite;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes drop {
  0% {
    opacity: 0;
    transform: translate(10px, -14px) scale(0.2);
  }
  70% {
    opacity: 1;
    transform: scale(1.25);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.ripple {
  fill: none;
  stroke: #ffc400;
  stroke-width: 2;
  transform-origin: 32px 32px;
  opacity: 0;
  animation: ripple 2.2s ease-out infinite;
}
.r2 {
  animation-delay: 1.1s;
}
@keyframes ripple {
  0% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  100% {
    transform: scale(2.1);
    opacity: 0;
  }
}
</style>
