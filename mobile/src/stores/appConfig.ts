import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/endpoints';
import type { PublicConfig } from '../api/types';

/** Public settings (fees, demo accounts). Loaded once; sensible defaults until it arrives. */
export const useAppConfig = defineStore('appConfig', () => {
  const config = ref<PublicConfig>({
    currency: 'NGN',
    pilotZone: 'Campus pilot zone',
    commissionPct: 8,
    orbitDeliveryFee: 700,
    paymentProvider: 'mock',
    pendingPaymentTtlMin: 15,
    demo: null,
  });
  const loaded = ref(false);

  async function load() {
    try {
      config.value = await api.config();
      loaded.value = true;
    } catch {
      /* keep defaults; the sign-in screen will surface connection problems */
    }
  }

  return { config, loaded, load };
});
