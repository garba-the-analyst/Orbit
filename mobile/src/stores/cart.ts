import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { Product, Shop } from '../api/types';

const KEY = 'orbit.cart';

interface Line {
  product: Pick<Product, 'id' | 'name' | 'price' | 'stock'>;
  qty: number;
}

interface Saved {
  shop: (Pick<Shop, 'id' | 'name' | 'color' | 'isOpen' | 'prepMinutes' | 'offersDelivery' | 'deliveryFee' | 'address'> & { currency?: string }) | null;
  lines: Line[];
}

const MAX_QTY = 20;

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return { shop: null, lines: [] };
}

/**
 * The basket. A basket holds items from one shop only (an order goes to one shop).
 * Prices here are for display; the server recalculates every price when the order is placed.
 */
export const useCart = defineStore('cart', () => {
  const saved = load();
  const shop = ref<Saved['shop']>(saved.shop);
  const lines = ref<Line[]>(saved.lines);

  watch(
    [shop, lines],
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ shop: shop.value, lines: lines.value }));
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  );

  const itemCount = computed(() => lines.value.reduce((n, l) => n + l.qty, 0));
  const subtotal = computed(() => lines.value.reduce((n, l) => n + l.qty * l.product.price, 0));
  const isEmpty = computed(() => lines.value.length === 0);

  const qtyOf = (productId: string) => lines.value.find((l) => l.product.id === productId)?.qty ?? 0;

  /** True if adding from this shop would replace a basket from a different shop. */
  const wouldReplace = (shopId: string) => !isEmpty.value && shop.value?.id !== shopId;

  function clear() {
    shop.value = null;
    lines.value = [];
  }

  /** Sets the quantity of a product (0 removes it). Starts a new basket if the shop differs. */
  function setQty(s: NonNullable<Saved['shop']>, product: Line['product'], qty: number) {
    if (shop.value?.id !== s.id) {
      clear();
      shop.value = s;
    }
    const capped = Math.max(0, Math.min(qty, MAX_QTY, Math.max(product.stock, 0)));
    const idx = lines.value.findIndex((l) => l.product.id === product.id);
    if (capped === 0) {
      if (idx >= 0) lines.value.splice(idx, 1);
      if (lines.value.length === 0) shop.value = null;
    } else if (idx >= 0) {
      lines.value[idx].qty = capped;
      lines.value[idx].product = product;
    } else {
      lines.value.push({ product, qty: capped });
    }
  }

  return { shop, lines, itemCount, subtotal, isEmpty, qtyOf, wouldReplace, setQty, clear, MAX_QTY };
});
