/** Pricing, routing and catalogue helpers shared by the demo server. Plain functions, no state. */
import type { VehicleType } from '../types';
import { along, curve, metres, PLACES } from './data';

export const VEHICLES: Array<{ type: VehicleType; label: string; blurb: string; fleet: 'LIGHT' | 'HEAVY'; passengers: number; maxWeightKg: number; rate: [number, number, number]; surge: number }> = [
  { type: 'BICYCLE', label: 'Bicycle', blurb: 'Small parcels, short hops', fleet: 'LIGHT', passengers: 0, maxWeightKg: 15, rate: [200, 60, 10], surge: 1 },
  { type: 'MOTORCYCLE', label: 'Motorcycle', blurb: 'Fastest through traffic', fleet: 'LIGHT', passengers: 1, maxWeightKg: 80, rate: [300, 90, 12], surge: 1 },
  { type: 'KEKE', label: 'Keke (tricycle)', blurb: 'Affordable, up to 3 people', fleet: 'LIGHT', passengers: 3, maxWeightKg: 300, rate: [400, 110, 15], surge: 1 },
  { type: 'CAR', label: 'Car', blurb: 'Comfort and air conditioning', fleet: 'LIGHT', passengers: 4, maxWeightKg: 150, rate: [600, 160, 20], surge: 1.2 },
  { type: 'VAN', label: 'Van', blurb: 'Furniture and bulky goods', fleet: 'HEAVY', passengers: 3, maxWeightKg: 1500, rate: [1500, 300, 30], surge: 1 },
  { type: 'TRUCK', label: 'Truck', blurb: 'Up to 8 tonnes', fleet: 'HEAVY', passengers: 2, maxWeightKg: 8000, rate: [4000, 600, 60], surge: 1 },
  { type: 'LORRY', label: 'Lorry', blurb: 'Up to 20 tonnes', fleet: 'HEAVY', passengers: 2, maxWeightKg: 20000, rate: [8000, 900, 90], surge: 1 },
  { type: 'LONG_HAUL', label: 'Long-haul truck', blurb: 'Inter-state heavy freight', fleet: 'HEAVY', passengers: 2, maxWeightKg: 35000, rate: [15000, 1200, 120], surge: 1 },
];
export const vehicleInfo = (t: string) => VEHICLES.find((v) => v.type === t)!;

export const GOODS = [
  { type: 'GENERAL', label: 'General goods' },
  { type: 'FOOD', label: 'Food', careful: true, urgent: true, handling: 'Keep upright and warm. Deliver quickly.' },
  { type: 'PERISHABLE', label: 'Perishable', careful: true, urgent: true, handling: 'Keep cool. Deliver quickly.' },
  { type: 'FRAGILE', label: 'Fragile', careful: true, handling: 'Handle with care. Do not stack.' },
  { type: 'DOCUMENTS', label: 'Documents' },
  { type: 'ELECTRONICS', label: 'Electronics', careful: true, handling: 'Keep dry. Handle with care.' },
  { type: 'LIVESTOCK', label: 'Livestock', careful: true, handling: 'Ventilated space. Handle calmly.' },
  { type: 'BUILDING', label: 'Building materials' },
  { type: 'BULK', label: 'Bulk cargo' },
];
export const goodsInfo = (t: string | null | undefined) => GOODS.find((g) => g.type === t) as { type: string; label: string; careful?: boolean; urgent?: boolean; handling?: string } | undefined;

export const DRIVER_FOR: Record<string, string> = { BICYCLE: 'd_bike', MOTORCYCLE: 'd_moto', KEKE: 'd_keke', CAR: 'd_car', VAN: 'd_van', TRUCK: 'd_truck', LORRY: 'd_lorry', LONG_HAUL: 'd_long' };
export const CAR_DETAILS: Record<string, { make: string; model: string; color: string; plate: string }> = {
  BICYCLE: { make: 'Phoenix', model: 'Roadster', color: 'Blue', plate: '—' },
  MOTORCYCLE: { make: 'Bajaj', model: 'Boxer 150', color: 'Red', plate: 'ABC-123XY' },
  KEKE: { make: 'TVS', model: 'King', color: 'Yellow', plate: 'LAG-789CD' },
  CAR: { make: 'Toyota', model: 'Corolla', color: 'Silver', plate: 'ABJ-452KM' },
  VAN: { make: 'Toyota', model: 'HiAce', color: 'White', plate: 'KJA-210VN' },
  TRUCK: { make: 'Isuzu', model: 'NPR', color: 'White', plate: 'KJA-456AB' },
  LORRY: { make: 'Mack', model: 'Granite', color: 'Green', plate: 'LND-880LR' },
  LONG_HAUL: { make: 'Mercedes', model: 'Actros', color: 'Blue', plate: 'KAN-501LH' },
};

export const roundFare = (n: number) => Math.max(100, Math.round(n / 50) * 50);

export function routeBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const distanceM = Math.max(400, Math.round(metres(a, b) * 1.3));
  const durationS = Math.round(distanceM / 7.5); // about 27 km/h
  return { distanceM, durationS, geometry: curve(a, b), source: 'estimate' };
}

export function fareFor(vehicleType: string, distanceM: number, durationS: number) {
  const v = vehicleInfo(vehicleType);
  const [base, perKm, perMin] = v.rate;
  const dist = Math.round((distanceM / 1000) * perKm);
  const time = Math.round((durationS / 60) * perMin);
  const full = base + dist + time;
  const fare = roundFare(full * v.surge);
  return { base, distance: dist, time, surge: v.surge, fullFare: fare, surgeAmount: fare - roundFare(full) };
}

export const placeFor = (lat: number, lng: number) => {
  let best = PLACES[0];
  let d = Infinity;
  for (const p of PLACES) {
    const m = metres({ lat, lng }, p);
    if (m < d) [best, d] = [p, m];
  }
  return d < 1500 ? best.label : `Near ${best.label.split(',')[0]}`;
};

export { along };
