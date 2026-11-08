/**
 * Domain enums shared across modules.
 *
 * They are plain string enums (not database enums) so the same schema works on SQLite and PostgreSQL.
 */

/** Who a user is on the platform. */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  MERCHANT = 'MERCHANT',
  RIDER = 'RIDER',
  ADMIN = 'ADMIN',
}

/**
 * Account lifecycle. Merchants and riders start as PENDING until an admin verifies them
 * (proposal section 8: merchant identity checks and courier onboarding).
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING_VERIFICATION',
  SUSPENDED = 'SUSPENDED',
}

/** How the buyer receives the goods. This choice at checkout is ORBIT's core differentiator. */
export enum Fulfilment {
  PICKUP = 'PICKUP',
  MERCHANT_DELIVERY = 'MERCHANT_DELIVERY',
  ORBIT_COURIER = 'ORBIT_COURIER',
}

/**
 * Order lifecycle (proposal section 8):
 *
 *   PENDING_PAYMENT -> PLACED -> CONFIRMED -> READY -> ON_THE_WAY -> DELIVERED
 *
 * - PICKUP orders skip ON_THE_WAY: the merchant verifies the PIN while READY.
 * - DELIVERED also means "collected" for pickup orders.
 * - CANCELLED can happen before the merchant confirms (customer) or at confirmation time (merchant rejects).
 */
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  READY = 'READY',
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum ShopStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  SUSPENDED = 'SUSPENDED',
}

/** Which party a ledger line belongs to. */
export enum LedgerParty {
  MERCHANT = 'MERCHANT',
  COURIER = 'COURIER',
  PLATFORM = 'PLATFORM',
}

export enum LedgerKind {
  /** Item sales minus ORBIT's commission, credited to the merchant. */
  SALE_NET = 'SALE_NET',
  /** Delivery fee kept by the merchant when they deliver themselves. */
  MERCHANT_DELIVERY_FEE = 'MERCHANT_DELIVERY_FEE',
  /** Marketplace commission earned by ORBIT. */
  COMMISSION = 'COMMISSION',
  /** Rider earnings for an ORBIT courier delivery. */
  DELIVERY_PAYOUT = 'DELIVERY_PAYOUT',
  /** ORBIT's net contribution on a courier delivery (fee minus rider payout). */
  DELIVERY_CONTRIBUTION = 'DELIVERY_CONTRIBUTION',
}

export type VehicleType = 'MOTORCYCLE' | 'BICYCLE' | 'KEKE';
export const VEHICLES: VehicleType[] = ['MOTORCYCLE', 'BICYCLE', 'KEKE'];
