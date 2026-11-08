<script setup lang="ts">
/**
 * The delivery PIN, drawn as the stub you hand over: a perforated slip with the four digits large.
 * The perforation is functional (it is the tear line between "the code" and "what to do with it").
 */
defineProps<{ pin: string; locked?: boolean; hint: string }>();
</script>

<template>
  <section class="stub" aria-label="Delivery PIN">
    <div class="top">
      <div class="label">Your delivery PIN</div>
      <div class="digits" :class="{ locked }" :aria-label="`PIN ${pin.split('').join(' ')}`">
        <span v-for="(d, i) in pin.split('')" :key="i">{{ d }}</span>
      </div>
    </div>
    <div class="tear" aria-hidden="true"></div>
    <p class="bottom">
      <template v-if="locked">This order is locked after too many wrong tries. Contact ORBIT support to unlock it.</template>
      <template v-else>{{ hint }}</template>
    </p>
  </section>
</template>

<style scoped>
.stub {
  position: relative;
  background: var(--surface);
  border-radius: 18px;
  box-shadow: 0 0 0 1px var(--line);
}
.top {
  padding: 18px 20px 16px;
}
.label {
  font: 600 var(--t-sm) / 1.2 var(--font-display);
  color: var(--slate);
}
.digits {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.digits span {
  flex: 1;
  display: grid;
  place-items: center;
  height: 68px;
  border-radius: 12px;
  background: var(--ink);
  color: var(--signal);
  font: 600 2.5rem / 1 var(--font-display);
  font-variant-numeric: tabular-nums;
}
.digits.locked span {
  background: var(--slate-faint);
  color: #fff;
}
/* The tear line: a dashed rule with a notch cut out of each side. */
.tear {
  position: relative;
  height: 0;
  border-top: 2px dashed var(--line);
  margin: 0 18px;
}
.tear::before,
.tear::after {
  content: '';
  position: absolute;
  top: -11px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--paper);
  box-shadow: inset 0 0 0 1px var(--line);
}
.tear::before {
  left: -29px;
}
.tear::after {
  right: -29px;
}
.bottom {
  margin: 0;
  padding: 14px 20px 18px;
  font-size: var(--t-sm);
  line-height: 1.45;
  color: var(--slate);
}
</style>
