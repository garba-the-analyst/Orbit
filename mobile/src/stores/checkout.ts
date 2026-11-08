import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PaymentIntent } from '../api/types';

/**
 * Holds the payment intent for an order between "Pay" on the basket and the payment screen.
 * Kept in memory only; if the app was reloaded, the payment screen asks the server for a fresh intent.
 */
export const useCheckout = defineStore('checkout', () => {
  const intents = ref<Record<string, PaymentIntent>>({});
  const set = (orderId: string, intent: PaymentIntent) => (intents.value[orderId] = intent);
  const take = (orderId: string) => intents.value[orderId] ?? null;
  const drop = (orderId: string) => delete intents.value[orderId];
  return { set, take, drop };
});
