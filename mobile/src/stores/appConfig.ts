import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/endpoints';
import { setDefaultCurrency } from '../lib/format';
import { SHOP_CATEGORIES, type PublicConfig, type VehicleInfo } from '../api/types';

const DEFAULTS: PublicConfig = {
  serviceArea: 'Nigeria',
  defaultMarket: 'NG',
  markets: [],
  commissionPct: 8,
  tripCommissionPct: 10,
  paymentProvider: 'mock',
  testMode: true,
  categories: [...SHOP_CATEGORIES],
  legal: { version: '1', consentRequired: false },
  pendingPaymentTtlMin: 15,
  map: { provider: 'osm', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', center: { lat: 9.0765, lng: 7.3986 }, attribution: '© OpenStreetMap contributors' },
  vehicles: [],
  goods: [],
  demo: null,
};

/** Public settings (markets, fees, vehicle catalogue, demo accounts). Loaded once; sensible defaults until it arrives. */
export const useAppConfig = defineStore('appConfig', () => {
  const config = ref<PublicConfig>({ ...DEFAULTS });
  const loaded = ref(false);

  async function load() {
    try {
      config.value = { ...DEFAULTS, ...(await api.config()) };
      loaded.value = true;
      setDefaultCurrency(market.value?.currency ?? 'NGN');
    } catch {
      /* keep defaults; the sign-in screen will surface connection problems */
    }
  }

  const market = computed(() => config.value.markets.find((m) => m.code === config.value.defaultMarket) ?? config.value.markets[0]);
  const currency = computed(() => market.value?.currency ?? 'NGN');
  const mapCenter = computed<{ lat: number; lng: number }>(() => {
    const c = config.value.map.center as { lat: number; lng: number } | [number, number];
    return Array.isArray(c) ? { lat: c[0], lng: c[1] } : c;
  });
  const vehicleInfo = (type: string): VehicleInfo | undefined => config.value.vehicles.find((v) => v.type === type);
  /** What ORBIT charges for a rider delivery of a shop order, in the main market's currency. */
  const orbitDeliveryFee = computed(() => (market.value as { orbitDeliveryFee?: number } | undefined)?.orbitDeliveryFee ?? 700);

  return { config, loaded, load, market, currency, mapCenter, vehicleInfo, orbitDeliveryFee };
});
