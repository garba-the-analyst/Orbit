<script setup lang="ts">
/** Swipeable pictures with dots. One picture shows no dots; none shows a placeholder tile. */
import { ref } from 'vue';
defineProps<{ images: string[]; alt: string; ratio?: string }>();
const index = ref(0);
const track = ref<HTMLDivElement>();
function onScroll() {
  const el = track.value;
  if (el) index.value = Math.round(el.scrollLeft / el.clientWidth);
}
</script>

<template>
  <div class="car" :style="{ aspectRatio: ratio ?? '4 / 3' }">
    <div v-if="images.length" ref="track" class="track" @scroll.passive="onScroll">
      <img v-for="(src, i) in images" :key="src" :src="src" :alt="`${alt} ${i + 1} of ${images.length}`" :loading="i ? 'lazy' : 'eager'" />
    </div>
    <div v-else class="none"><slot name="empty">No photo</slot></div>
    <div v-if="images.length > 1" class="dots" aria-hidden="true"><i v-for="(_, i) in images" :key="i" :class="{ on: i === index }"></i></div>
  </div>
</template>

<style scoped>
.car {
  position: relative;
  width: 100%;
  background: var(--ink-wash);
  overflow: hidden;
}
.track {
  display: flex;
  height: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.track::-webkit-scrollbar {
  display: none;
}
.track img {
  flex: none;
  width: 100%;
  height: 100%;
  object-fit: cover;
  scroll-snap-align: center;
}
.none {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--slate);
}
.dots {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transition: all var(--dur-2) var(--ease);
}
.dots i.on {
  width: 20px;
  border-radius: 4px;
  background: #fff;
}
</style>
