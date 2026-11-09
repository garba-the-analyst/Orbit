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
  /** The customer sends their own rider to collect it from the shop; the shop checks the PIN at handover. */
  CUSTOMER_RIDER = 'CUSTOMER_RIDER',
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
  /** A driver's share of a trip fare (the fare less ORBIT's commission). */
  TRIP_EARNING = 'TRIP_EARNING',
  /** ORBIT's commission on a trip, less any promotion ORBIT paid for. */
  TRIP_COMMISSION = 'TRIP_COMMISSION',
  /** A tip: passed to the driver in full. */
  TRIP_TIP = 'TRIP_TIP',
}

/** What a trip carries: people (RIDE) or goods (PARCEL, from a small parcel to a lorry load). */
export enum TripKind {
  RIDE = 'RIDE',
  PARCEL = 'PARCEL',
}

export enum TripStatus {
  SEARCHING = 'SEARCHING',
  ACCEPTED = 'ACCEPTED',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_DRIVER = 'NO_DRIVER',
}

export enum PaymentMethod {
  CASH = 'CASH',
  /** Test-mode card payment. Becomes a real gateway charge when a payment provider is connected. */
  CARD = 'CARD',
}

/**
 * Every kind of vehicle on the platform.
 *
 * LIGHT fleet: bicycles, motorbikes, rickshaws (keke) and cars. They carry passengers and small parcels, and do
 * marketplace deliveries. HEAVY fleet: pickups/vans, trucks, lorries and long-haul trailers. They move heavy or bulky
 * goods and take only logistics requests.
 */
export type VehicleType = 'BICYCLE' | 'MOTORCYCLE' | 'KEKE' | 'CAR' | 'VAN' | 'TRUCK' | 'LORRY' | 'LONG_HAUL';
export const VEHICLES: VehicleType[] = ['BICYCLE', 'MOTORCYCLE', 'KEKE', 'CAR', 'VAN', 'TRUCK', 'LORRY', 'LONG_HAUL'];

export type Fleet = 'LIGHT' | 'HEAVY';
export const FLEETS: Fleet[] = ['LIGHT', 'HEAVY'];

/** What is being moved. Drives handling notes shown to drivers and who can carry it. */
export type GoodsType =
  | 'FOOD'
  | 'PERISHABLE'
  | 'FRAGILE'
  | 'ELECTRONICS'
  | 'DOCUMENTS'
  | 'HOUSEHOLD'
  | 'BUILDING'
  | 'GENERAL';
export const GOODS_TYPES: GoodsType[] = [
  'FOOD',
  'PERISHABLE',
  'FRAGILE',
  'ELECTRONICS',
  'DOCUMENTS',
  'HOUSEHOLD',
  'BUILDING',
  'GENERAL',
];

export type ProductKind = 'GOOD' | 'SERVICE';
