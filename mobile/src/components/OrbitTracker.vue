<script setup lang="ts">
/**
 * The order tracker: a ring that fills as an order moves through its stops, with a yellow satellite
 * that travels to the next stop each time the status changes. When the order is delivered the loop
 * closes and the satellite is back where it began: an orbit that returns to you.
 *
 * `index` is the current stop (0-based, -1 before the first). The satellite's travel is a CSS
 * transition, so it only moves when the status actually changes, and reduced-motion makes it instant.
 */
import { computed } from 'vue';

const props = defineProps<{
  /** Number of stops, including the last one that closes the loop. */
  count: number;
  index: number;
  cancelled?: boolean;
  title: string;
  sub?: string;
}>();

const R = 78;
const CIRC = 2 * Math.PI * R;
const steps = computed(() => Math.max(props.count - 1, 1));
const frac = computed(() => (props.cancelled ? 0 : Math.min(Math.max(props.index, 0) / steps.value, 1)));
const angle = computed(() => frac.value * 360);
const dashOffset = computed(() => CIRC * (1 - frac.value));
/** Stop markers sit on the ring; the final stop is the start point, so it gets no marker of its own. */
const dots = computed(() =>
  Array.from({ length: Math.max(props.count - 1, 0) }, (_, i) => {
    const a = (i / steps.value) * 2 * Math.PI - Math.PI / 2;
    return { x: 100 + R * Math.cos(a), y: 100 + R * Math.sin(a), done: !props.cancelled && i <= props.index };
  }),
);
const closed = computed(() => !props.cancelled && props.index >= props.count - 1);
</script>

<template>
  <div class="tracker" :class="{ cancelled, closed }" role="img" :aria-label="`${title}. ${sub ?? ''}`">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="track" cx="100" cy="100" :r="R" />
      <circle
        class="progress"
        cx="100"
        cy="100"
        :r="R"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="dashOffset"
        transform="rotate(-90 100 100)"
      />
      <circle v-for="(d, i) in dots" :key="i" class="dot" :class="{ done: d.done }" :cx="d.x" :cy="d.y" r="4.5" />
      <g v-if="!cancelled" class="satellite" :style="{ transform: `rotate(${angle}deg)` }">
        <circle cx="100" :cy="100 - R" r="11" />
      </g>
    </svg>
    <div class="center">
      <div class="t">{{ title }}</div>
      <div v-if="sub" class="s">{{ sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.tracker {
  position: relative;
  width: min(264px, 72vw);
  aspect-ratio: 1;
  margin: 0 auto;
}
svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.track {
  fill: none;
  stroke: var(--line);
  stroke-width: 9;
}
.progress {
  fill: none;
  stroke: var(--ink);
  stroke-width: 9;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}
.dot {
  fill: var(--paper);
  stroke: var(--line);
  stroke-width: 2.5;
}
.dot.done {
  fill: var(--ink);
  stroke: var(--paper);
}
.satellite {
  transform-origin: 100px 100px;
  transform-box: view-box;
  transition: transform 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}
.satellite circle {
  fill: var(--signal);
  stroke: var(--ink);
  stroke-width: 3.5;
}
.cancelled .track {
  stroke: var(--bad-wash);
  stroke-dasharray: 3 9;
  stroke-linecap: round;
}
.closed .progress {
  stroke: var(--good);
}
.center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 14%;
}
.t {
  font: 600 var(--t-xl) / 1.1 var(--font-display);
  letter-spacing: -0.025em;
}
.s {
  margin-top: 6px;
  font-size: var(--t-sm);
  line-height: 1.35;
  color: var(--slate);
}
.cancelled .t {
  color: var(--bad);
}
</style>
