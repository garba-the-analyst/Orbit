/**
 * Static catalogues: vehicle types and goods types. Kept in one place so the API, the fare engine, matching and
 * the app all agree. Both are served to the app by GET /config.
 */
import type { Fleet, GoodsType, VehicleType } from './enums';

export interface VehicleSpec {
  type: VehicleType;
  label: string;
  fleet: Fleet;
  /** Can this vehicle take passengers (ride-hailing)? */
  passengers: number;
  /** Heaviest load it should be offered, in kilograms. */
  maxWeightKg: number;
  /** Fare tariff in whole naira. fare = max(minFare, base + perKm * km + perMin * minutes). */
  tariff: { base: number; perKm: number; perMin: number; minFare: number };
  /** Average speed used for estimates when routing is offline, in km/h. */
  avgKmh: number;
  /** How far from the pickup we will look for this kind of vehicle, in kilometres. */
  searchRadiusKm: number;
  blurb: string;
}

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  BICYCLE: {
    type: 'BICYCLE', label: 'Bicycle', fleet: 'LIGHT', passengers: 0, maxWeightKg: 10,
    tariff: { base: 150, perKm: 50, perMin: 3, minFare: 250 }, avgKmh: 14, searchRadiusKm: 3,
    blurb: 'Small parcels over short distances',
  },
  MOTORCYCLE: {
    type: 'MOTORCYCLE', label: 'Motorbike', fleet: 'LIGHT', passengers: 1, maxWeightKg: 25,
    tariff: { base: 200, perKm: 70, perMin: 5, minFare: 300 }, avgKmh: 30, searchRadiusKm: 6,
    blurb: 'Fastest through traffic. One passenger or a small parcel',
  },
  KEKE: {
    type: 'KEKE', label: 'Rickshaw', fleet: 'LIGHT', passengers: 3, maxWeightKg: 150,
    tariff: { base: 250, perKm: 90, perMin: 6, minFare: 400 }, avgKmh: 26, searchRadiusKm: 6,
    blurb: 'Up to 3 passengers, or bulky parcels',
  },
  CAR: {
    type: 'CAR', label: 'Car', fleet: 'LIGHT', passengers: 4, maxWeightKg: 200,
    tariff: { base: 500, perKm: 150, perMin: 10, minFare: 800 }, avgKmh: 32, searchRadiusKm: 8,
    blurb: 'Comfortable, up to 4 passengers',
  },
  VAN: {
    type: 'VAN', label: 'Pickup / van', fleet: 'HEAVY', passengers: 0, maxWeightKg: 1000,
    tariff: { base: 2500, perKm: 250, perMin: 15, minFare: 3500 }, avgKmh: 35, searchRadiusKm: 25,
    blurb: 'Furniture, appliances, up to 1 tonne',
  },
  TRUCK: {
    type: 'TRUCK', label: 'Truck', fleet: 'HEAVY', passengers: 0, maxWeightKg: 5000,
    tariff: { base: 8000, perKm: 400, perMin: 20, minFare: 12000 }, avgKmh: 40, searchRadiusKm: 50,
    blurb: 'House moves and stock, up to 5 tonnes',
  },
  LORRY: {
    type: 'LORRY', label: 'Lorry', fleet: 'HEAVY', passengers: 0, maxWeightKg: 15000,
    tariff: { base: 20000, perKm: 700, perMin: 30, minFare: 30000 }, avgKmh: 45, searchRadiusKm: 100,
    blurb: 'Bulk cargo, building materials, up to 15 tonnes',
  },
  LONG_HAUL: {
    type: 'LONG_HAUL', label: 'Long-haul trailer', fleet: 'HEAVY', passengers: 0, maxWeightKg: 40000,
    tariff: { base: 50000, perKm: 1100, perMin: 40, minFare: 100000 }, avgKmh: 55, searchRadiusKm: 300,
    blurb: 'Inter-city freight, up to 40 tonnes',
  },
};

export interface GoodsSpec {
  type: GoodsType;
  label: string;
  /** The handling note shown to the driver. */
  handling: string;
  /** Needs extra care: shown with a highlighted indicator. */
  careful: boolean;
  /** Time-sensitive: should not sit in a vehicle for long. */
  urgent: boolean;
}

export const GOODS_SPECS: Record<GoodsType, GoodsSpec> = {
  FOOD: { type: 'FOOD', label: 'Food', handling: 'Hot or fresh food. Keep upright and deliver quickly.', careful: false, urgent: true },
  PERISHABLE: { type: 'PERISHABLE', label: 'Perishable', handling: 'Spoils quickly. Keep cool, avoid delays and direct sun.', careful: true, urgent: true },
  FRAGILE: { type: 'FRAGILE', label: 'Fragile', handling: 'Breakable. Handle gently and do not stack.', careful: true, urgent: false },
  ELECTRONICS: { type: 'ELECTRONICS', label: 'Electronics', handling: 'Keep dry and padded. Do not stack heavy items on top.', careful: true, urgent: false },
  DOCUMENTS: { type: 'DOCUMENTS', label: 'Documents', handling: 'Keep flat and dry. Hand over only to the named recipient.', careful: false, urgent: false },
  HOUSEHOLD: { type: 'HOUSEHOLD', label: 'Household items', handling: 'Secure the load so it cannot shift.', careful: false, urgent: false },
  BUILDING: { type: 'BUILDING', label: 'Building materials', handling: 'Heavy or bulky. Secure the load and check the vehicle limit.', careful: false, urgent: false },
  GENERAL: { type: 'GENERAL', label: 'Other goods', handling: 'Handle with normal care.', careful: false, urgent: false },
};

/** What a shop or service business can be listed under. Served to the app by GET /config. */
export const SHOP_CATEGORIES = ['Food', 'Groceries', 'Farm produce', 'Fashion', 'Beauty & Health', 'Gadgets', 'Home & Hardware', 'Stationery', 'Services'];

/** Rough fleet for a vehicle type. */
export const fleetOf = (v: VehicleType): Fleet => VEHICLE_SPECS[v].fleet;

/** The fleet for a vehicle string from the database, or null when it is unknown or unset. */
export const fleetOfOrNull = (v: string | null | undefined): Fleet | null =>
  v && (VEHICLE_SPECS as Record<string, { fleet: Fleet }>)[v] ? (VEHICLE_SPECS as Record<string, { fleet: Fleet }>)[v].fleet : null;

/** Handling strictness, most demanding first. A basket is labelled by its most demanding goods. */
const GOODS_PRIORITY: GoodsType[] = ['PERISHABLE', 'FOOD', 'FRAGILE', 'ELECTRONICS', 'BUILDING', 'HOUSEHOLD', 'DOCUMENTS', 'GENERAL'];
export const dominantGoods = (types: string[]): GoodsType =>
  GOODS_PRIORITY.find((g) => types.includes(g)) ?? 'GENERAL';
