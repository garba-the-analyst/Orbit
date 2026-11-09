/**
 * What each person is allowed to see of a trip ("lens", like orders). The customer sees the driver and the PIN
 * they must read out; the driver sees the customer's first name and what to collect; neither sees the other's
 * phone number once the trip is over; ORBIT staff see everything.
 */
import { GOODS_SPECS, VEHICLE_SPECS } from '../common/catalog';
import { PaymentMethod, TripKind, TripStatus } from '../common/enums';
import { marketOf } from '../common/markets';
import { scaleAmount } from '../common/money';
import { derivePin } from '../common/pin.util';
import { config } from '../config/config';
import { User } from '../users/user.entity';
import { Trip } from './trip.entities';

export type TripLens = 'customer' | 'driver' | 'admin';

export const ACTIVE_STATUSES = [TripStatus.SEARCHING, TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS];
export const WITH_DRIVER_STATUSES = [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS];
const TERMINAL = [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.NO_DRIVER];

export const startPinOf = (t: { id: string }) => derivePin(`${t.id}:start`, config.pinSecret);
export const dropPinOf = (t: { id: string }) => derivePin(`${t.id}:drop`, config.pinSecret);

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const ratingOf = (u: Pick<User, 'ratingSum' | 'ratingCount'>) => ({
  average: u.ratingCount > 0 ? Math.round((u.ratingSum / u.ratingCount) * 10) / 10 : null,
  count: u.ratingCount,
});

/** Cancelling after the free window, or after the driver has arrived, is a "late" cancellation. */
export function isLateCancel(t: Trip, now = Date.now()): boolean {
  if (t.status === TripStatus.ARRIVED) return true;
  if (t.status === TripStatus.ACCEPTED && t.acceptedAt) return now - new Date(t.acceptedAt).getTime() > config.trips.freeCancelSec * 1000;
  return false;
}

/** The fee a card-paying customer is charged for cancelling the trip right now (0 when it is free). */
export function cancelFeeNow(t: Trip, now = Date.now()): number {
  if (t.paymentMethod !== PaymentMethod.CARD || !isLateCancel(t, now)) return 0;
  return scaleAmount(config.trips.cancelFee, marketOf(t.country));
}

export interface TripView {
  id: string; code: string; kind: string; status: string;
  vehicleType: string; vehicleLabel: string; currency: string;
  pickup: { address: string; lat: number; lng: number };
  drop: { address: string; lat: number; lng: number };
  distanceM: number; durationS: number; geometry: Array<[number, number]>;
  price: {
    base: number; distance: number; time: number; surge: number; fullFare: number; discount: number; promoCode: string | null;
    total: number; tip: number; cancelFee: number; method: string; paid: boolean;
    /** Driver and admin lenses. */
    driverEarning?: number; collectInCash?: number; commission?: number;
  };
  cargo: { passengers: number; goodsType: string | null; goodsLabel: string | null; careful: boolean; urgent: boolean; handling: string | null; weightKg: number | null; notes: string | null };
  recipient: { name: string; phone: string | null } | null;
  driver: { id: string; firstName: string; name?: string; phone: string | null; rating: { average: number | null; count: number } } | null;
  customer: { id: string; firstName: string; name?: string; phone: string | null; rating: { average: number | null; count: number } } | null;
  vehicle: Trip['vehicleInfo'];
  /** Customer lens only: the PIN to read out. A ride's start PIN goes to the driver at pickup; a parcel's drop PIN goes to the recipient. */
  pin: { purpose: 'start' | 'drop'; code: string } | null;
  pinLocked: boolean;
  search: { wave: number; maxWaves: number; expiresAt: string | null } | null;
  cancel: { allowed: boolean; fee: number; late: boolean } | null;
  times: Record<'requestedAt' | 'acceptedAt' | 'arrivedAt' | 'startedAt' | 'completedAt' | 'cancelledAt', string | null>;
  cancelledBy: string | null; cancelReason: string | null;
  ratings: { given: number | null; received: number | null; comment: string | null };
  canRate: boolean; canTip: boolean; shared: boolean;
}

export function toTripView(t: Trip, lens: TripLens, people: { driver?: User | null; customer?: User | null }, now = Date.now()): TripView {
  const spec = VEHICLE_SPECS[t.vehicleType as keyof typeof VEHICLE_SPECS];
  const goods = t.goodsType ? GOODS_SPECS[t.goodsType as keyof typeof GOODS_SPECS] : undefined;
  const live = WITH_DRIVER_STATUSES.includes(t.status as TripStatus);
  const done = t.status === TripStatus.COMPLETED;
  const ratingWindow = done && t.completedAt && now - new Date(t.completedAt).getTime() < 7 * 86_400_000;

  const phoneVisible = lens === 'admin' || live;
  const driver = people.driver && t.driverId && lens !== 'driver'
    ? { id: people.driver.id, firstName: firstName(people.driver.name), ...(lens === 'admin' ? { name: people.driver.name } : {}), phone: phoneVisible ? people.driver.phone : null, rating: ratingOf(people.driver) }
    : null;
  const customer = people.customer && lens !== 'customer'
    ? { id: people.customer.id, firstName: firstName(people.customer.name), ...(lens === 'admin' ? { name: people.customer.name } : {}), phone: phoneVisible ? people.customer.phone : null, rating: ratingOf(people.customer) }
    : null;

  const price: TripView['price'] = {
    base: t.baseFare, distance: t.distanceFare, time: t.timeFare, surge: t.surge, fullFare: t.fullFare, discount: t.discount,
    promoCode: t.promoCode, total: t.fare, tip: t.tip, cancelFee: t.cancelFee, method: t.paymentMethod, paid: t.paid,
  };
  if (lens !== 'customer') {
    price.driverEarning = t.driverEarning;
    price.collectInCash = t.paymentMethod === PaymentMethod.CASH ? t.fare : 0;
  }
  if (lens === 'admin') price.commission = t.commission;

  let pin: TripView['pin'] = null;
  if (lens === 'customer') {
    if (t.kind === TripKind.RIDE && (t.status === TripStatus.ACCEPTED || t.status === TripStatus.ARRIVED)) pin = { purpose: 'start', code: startPinOf(t) };
    if (t.kind === TripKind.PARCEL && !TERMINAL.includes(t.status as TripStatus)) pin = { purpose: 'drop', code: dropPinOf(t) };
  }

  // Ratings: "given" is what this person gave, "received" what they got.
  const ratings = lens === 'driver'
    ? { given: t.customerRating, received: t.driverRating, comment: null }
    : { given: t.driverRating, received: lens === 'admin' ? t.customerRating : null, comment: t.ratingComment };

  let cancel: TripView['cancel'] = null;
  if (lens === 'customer' && ACTIVE_STATUSES.includes(t.status as TripStatus)) {
    cancel = t.status === TripStatus.IN_PROGRESS
      ? { allowed: false, fee: 0, late: false }
      : { allowed: true, fee: cancelFeeNow(t, now), late: isLateCancel(t, now) };
  }

  return {
    id: t.id, code: t.code, kind: t.kind, status: t.status,
    vehicleType: t.vehicleType, vehicleLabel: spec?.label ?? t.vehicleType, currency: t.currency,
    pickup: { address: t.pickupAddress, lat: t.pickupLat, lng: t.pickupLng },
    drop: { address: t.dropAddress, lat: t.dropLat, lng: t.dropLng },
    distanceM: t.distanceM, durationS: t.durationS, geometry: t.geometry ?? [],
    price,
    cargo: {
      passengers: t.passengers, goodsType: t.goodsType, goodsLabel: goods?.label ?? null, careful: goods?.careful ?? false,
      urgent: goods?.urgent ?? false, handling: goods?.handling ?? null, weightKg: t.weightKg, notes: t.notes,
    },
    recipient: t.kind === TripKind.PARCEL && t.recipientName
      ? { name: t.recipientName, phone: lens === 'customer' || phoneVisible ? t.recipientPhone : null }
      : null,
    driver, customer,
    vehicle: t.vehicleInfo ?? null,
    pin,
    pinLocked: t.pinAttempts >= config.trips.maxPinAttempts,
    search: t.status === TripStatus.SEARCHING ? { wave: t.wave, maxWaves: config.trips.maxWaves, expiresAt: iso(t.waveExpiresAt) } : null,
    cancel,
    times: {
      requestedAt: iso(t.requestedAt), acceptedAt: iso(t.acceptedAt), arrivedAt: iso(t.arrivedAt),
      startedAt: iso(t.startedAt), completedAt: iso(t.completedAt), cancelledAt: iso(t.cancelledAt),
    },
    cancelledBy: t.cancelledBy, cancelReason: t.cancelReason,
    ratings,
    canRate: lens === 'customer' ? !!ratingWindow && t.driverRating === null : lens === 'driver' ? !!ratingWindow && t.customerRating === null : false,
    canTip: lens === 'customer' && !!(done && t.paymentMethod === PaymentMethod.CARD && t.tip === 0 && t.completedAt && now - new Date(t.completedAt).getTime() < 86_400_000),
    shared: lens === 'customer' ? !!t.shareToken : false,
  };
}
