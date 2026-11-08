<script setup lang="ts">
/** One order in a customer's history. */
import { computed } from 'vue';
import type { OrderView } from '../api/types';
import { naira, plural, when } from '../lib/format';
import { FULFILMENT_LABEL, shortStatus } from '../lib/status';
import ShopSign from './ShopSign.vue';

const props = defineProps<{ order: OrderView }>();
const status = computed(() => shortStatus(props.order));
const summary = computed(() => props.order.items.map((i) => `${i.qty} × ${i.name}`).join(', '));
</script>

<template>
  <div class="orow">
    <ShopSign :name="order.shop.name" :color="order.shop.color" :size="48" />
    <div class="grow">
      <div class="row between">
        <div class="name">{{ order.shop.name }}</div>
        <div class="money">{{ naira(order.total) }}</div>
      </div>
      <div class="items small muted">{{ summary }}</div>
      <div class="row between meta">
        <span class="status" :class="status.tone === 'ink' ? '' : status.tone">{{ status.text }}</span>
        <span class="xsmall muted">{{ FULFILMENT_LABEL[order.fulfilment] }} · {{ when(order.timeline.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orow {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.name {
  font: 600 var(--t-md) / 1.25 var(--font-display);
  letter-spacing: -0.01em;
}
.items {
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  margin-top: 8px;
}
</style>
