<script setup lang="ts">
/** The goods-type indicator: food, perishable, fragile and so on, so handling needs are visible before ordering. */
import { computed } from 'vue';
import { useAppConfig } from '../stores/appConfig';
const props = defineProps<{ type: string; kind?: 'GOOD' | 'SERVICE' }>();
const cfg = useAppConfig();
const label = computed(() => (props.kind === 'SERVICE' ? 'Service' : (cfg.config.goods.find((g) => g.type === props.type)?.label ?? props.type.charAt(0) + props.type.slice(1).toLowerCase())));
const tone = computed(() => (props.kind === 'SERVICE' ? 'svc' : ({ FOOD: 'warn', PERISHABLE: 'bad', FRAGILE: 'ink', ELECTRONICS: 'ink' } as Record<string, string>)[props.type] ?? 'plain'));
</script>

<template>
  <span v-if="kind === 'SERVICE' || (type && type !== 'GENERAL')" class="tag" :class="tone">{{ label }}</span>
</template>

<style scoped>
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font: 700 var(--t-xs) / 1.5 var(--font-display);
  background: var(--ink-wash);
  color: var(--ink);
}
.warn {
  background: var(--warn-wash);
  color: var(--warn);
}
.bad {
  background: var(--bad-wash);
  color: var(--bad);
}
.svc {
  background: var(--good-wash);
  color: var(--good);
}
</style>
