<script setup lang="ts">
/** A bar pinned to the bottom of shopping screens that shows the basket total and opens it. */
import { useRouter } from 'vue-router';
import { money, plural } from '../lib/format';
import { useCart } from '../stores/cart';

defineProps<{ aboveTabs?: boolean }>();
const cart = useCart();
const router = useRouter();
</script>

<template>
  <div v-if="!cart.isEmpty" class="bar" :class="{ above: aboveTabs }">
    <button class="btn btn-ink block go" @click="router.push('/c/basket')">
      <span>View basket · {{ plural(cart.itemCount, 'item') }}</span>
      <span class="money">{{ money(cart.subtotal, cart.shop?.currency) }}</span>
    </button>
  </div>
</template>

<style scoped>
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  padding: 12px var(--gutter) calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--paper) 70%, transparent);
  max-width: 480px;
  margin: 0 auto;
}
.bar.above {
  bottom: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: 12px;
}
.go {
  justify-content: space-between;
  box-shadow: var(--shadow-lg);
}
</style>
