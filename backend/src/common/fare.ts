/**
 * Trip pricing: pure functions, so the rules are easy to read and to test.
 *
 * fare = max(minimum fare, base + per-km x distance + per-minute x time) x surge, rounded UP to the market's
 * rounding step. The customer sees this price before they request, and it is fixed for the trip ("upfront
 * pricing"): a detour does not change it.
 */
import type { VehicleSpec } from './catalog';
import { Market } from './markets';
import { scaleAmount } from './money';

export type Tariff = VehicleSpec['tariff'];

export interface FareInput {
  tariff: Tariff;
  market: Market;
  distanceM: number;
  durationS: number;
  /** 1 means no surge. */
  surge: number;
  commissionBps: number;
}

export interface FareBreakdown {
  base: number;
  distanceFare: number;
  timeFare: number;
  minFare: number;
  surge: number;
  /** What the surge added, in currency units (0 when there is none). */
  surgeAmount: number;
  /** The total the customer is quoted, before any promotion. */
  fare: number;
  commission: number;
  driverEarning: number;
}

export function computeFare(i: FareInput): FareBreakdown {
  const base = scaleAmount(i.tariff.base, i.market);
  const perKm = scaleAmount(i.tariff.perKm, i.market);
  const perMin = scaleAmount(i.tariff.perMin, i.market);
  const minFare = scaleAmount(i.tariff.minFare, i.market);
  const distanceFare = Math.round((perKm * i.distanceM) / 1000);
  const timeFare = Math.round((perMin * i.durationS) / 60);
  const beforeSurge = Math.max(minFare, base + distanceFare + timeFare);
  const withSurge = beforeSurge * i.surge;
  const step = Math.max(1, i.market.fareRounding);
  const fare = Math.ceil(Math.round(withSurge * 100) / 100 / step) * step; // round up, ignoring float dust
  const unsurged = Math.ceil(beforeSurge / step) * step;
  const commission = Math.round((fare * i.commissionBps) / 10_000);
  return {
    base, distanceFare, timeFare, minFare,
    surge: i.surge,
    surgeAmount: Math.max(0, fare - unsurged),
    fare, commission, driverEarning: fare - commission,
  };
}

/**
 * Demand-based price multiplier. With more waiting requests than available drivers the price rises 15% for each
 * extra request per driver, up to a ceiling, in steps of 0.1. With no drivers at all there is nobody to attract,
 * so there is no surge (the app tells the customer nobody is available).
 */
export function surgeMultiplier(demand: number, supply: number, max: number): number {
  if (supply <= 0 || demand <= supply) return 1;
  const raw = 1 + 0.15 * (demand / supply - 1);
  return Math.min(max, Math.max(1, Math.round(raw * 10) / 10));
}

/**
 * A promotion's discount. It can never exceed ORBIT's own commission on the trip: ORBIT pays for promotions out of
 * its share, so the driver's earning is unaffected.
 */
export function promoDiscount(
  promo: { type: 'PERCENT' | 'FLAT'; value: number; maxDiscount: number | null },
  fare: number,
  commission: number,
): number {
  const raw = promo.type === 'PERCENT' ? Math.round((fare * promo.value) / 100) : promo.value;
  const capped = promo.maxDiscount !== null ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, commission, fare));
}
