<script setup lang="ts">
/**
 * Content-loading placeholders that match the shape of what is coming, so nothing jumps when data arrives.
 *  kind="rows"   list rows with a leading square (orders, notifications)
 *  kind="cards"  a grid of image cards (shops, products)
 *  kind="detail" a hero image, a title and a few paragraphs (shop or product page)
 *  kind="map"    a map panel with a bottom sheet (booking, tracking)
 */
withDefaults(defineProps<{ kind?: 'rows' | 'cards' | 'detail' | 'map'; count?: number }>(), { kind: 'rows', count: 4 });
</script>

<template>
  <div role="status" aria-label="Loading" class="sk">
    <template v-if="kind === 'rows'">
      <div v-for="i in count" :key="i" class="srow" :style="{ '--n': i }">
        <div class="skeleton sq"></div>
        <div class="lines">
          <div class="skeleton l1"></div>
          <div class="skeleton l2"></div>
        </div>
      </div>
    </template>
    <div v-else-if="kind === 'cards'" class="grid">
      <div v-for="i in count" :key="i" class="card" :style="{ '--n': i }">
        <div class="skeleton img"></div>
        <div class="skeleton l1"></div>
        <div class="skeleton l2"></div>
      </div>
    </div>
    <template v-else-if="kind === 'detail'">
      <div class="skeleton hero"></div>
      <div class="skeleton l1" style="height: 24px; width: 60%; margin-top: 18px"></div>
      <div class="skeleton l2" style="margin-top: 12px"></div>
      <div class="skeleton l2" style="margin-top: 8px; width: 70%"></div>
      <div class="skeleton l2" style="margin-top: 28px; height: 52px; width: 100%; border-radius: 14px"></div>
    </template>
    <template v-else>
      <div class="skeleton map"></div>
      <div class="skeleton l1" style="height: 22px; margin-top: 16px"></div>
      <div v-for="i in 3" :key="i" class="skeleton l2" style="height: 56px; width: 100%; margin-top: 10px; border-radius: 14px"></div>
    </template>
  </div>
</template>

<style scoped>
.srow {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
  animation: fade 0.4s var(--ease) calc(var(--n) * 60ms) both;
}
.sq {
  width: 52px;
  height: 52px;
  border-radius: var(--r-sign);
  flex: none;
}
.lines {
  flex: 1;
}
.l1 {
  height: 16px;
  width: 58%;
}
.l2 {
  height: 12px;
  width: 80%;
  margin-top: 10px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.card {
  animation: fade 0.4s var(--ease) calc(var(--n) * 60ms) both;
}
.img {
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  margin-bottom: 10px;
}
.hero {
  height: 200px;
  border-radius: 18px;
}
.map {
  height: 280px;
  border-radius: 18px;
}
@keyframes fade {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
