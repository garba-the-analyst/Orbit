/**
 * Money rules for ORBIT. All amounts are whole naira (integers) so there is no floating-point drift.
 *
 * Settlement invariant (verified in tests): for every delivered order,
 *   merchant + courier + platform ledger lines == order total.
 */
import { Fulfilment } from './enums';

export interface ChargeInputs {
  subtotal: number;
  fulfilment: Fulfilment;
  /** The merchant's own delivery fee (used only for MERCHANT_DELIVERY). */
  merchantDeliveryFee: number;
  commissionBps: number;
  orbitDeliveryFee: number;
  courierPayout: number;
}

export interface Charges {
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** ORBIT's marketplace commission, taken from the item subtotal only (never from delivery fees). */
  commission: number;
  /** Rider earnings; zero unless an ORBIT courier delivers. */
  courierPayout: number;
  /** ORBIT's net delivery margin; zero unless an ORBIT courier delivers. */
  platformDeliveryContribution: number;
}

/** Calculates every money field of an order from its inputs. Pure function. */
export function computeCharges(i: ChargeInputs): Charges {
  const commission = Math.round((i.subtotal * i.commissionBps) / 10_000);

  let deliveryFee = 0;
  let courierPayout = 0;
  let platformDeliveryContribution = 0;

  if (i.fulfilment === Fulfilment.MERCHANT_DELIVERY) {
    deliveryFee = i.merchantDeliveryFee;
  } else if (i.fulfilment === Fulfilment.ORBIT_COURIER) {
    deliveryFee = i.orbitDeliveryFee;
    courierPayout = i.courierPayout;
    platformDeliveryContribution = i.orbitDeliveryFee - i.courierPayout;
  }

  return {
    subtotal: i.subtotal,
    deliveryFee,
    total: i.subtotal + deliveryFee,
    commission,
    courierPayout,
    platformDeliveryContribution,
  };
}

/**
 * Converts an amount defined in the base (naira) tariff into a market's currency, rounded to a sensible unit.
 * Nigeria is the base, so its amounts are returned unchanged.
 */
export function scaleAmount(baseAmount: number, market: { tariffScale: number; fareRounding: number }): number {
  if (market.tariffScale === 1) return baseAmount;
  const rounding = Math.max(1, market.fareRounding);
  return Math.max(rounding, Math.ceil((baseAmount * market.tariffScale) / rounding) * rounding);
}
