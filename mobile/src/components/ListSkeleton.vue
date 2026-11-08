<script setup lang="ts">
/** Loading placeholder shaped like the rows that are coming, so the screen does not jump when data arrives. */
withDefaults(defineProps<{ rows?: number; sign?: boolean }>(), { rows: 4, sign: true });
</script>

<template>
  <div role="status" aria-label="Loading">
    <div v-for="i in rows" :key="i" class="srow">
      <div v-if="sign" class="skeleton sq"></div>
      <div class="lines">
        <div class="skeleton l1"></div>
        <div class="skeleton l2"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.srow {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
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
</style>
