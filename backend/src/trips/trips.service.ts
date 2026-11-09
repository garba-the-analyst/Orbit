/**
 * Trips: on-demand rides, parcel delivery and freight, from quote to payment to rating.
 *
 * Money rules (all whole currency units, fixed when the trip is requested):
 *   fullFare   = quoted fare (distance + time + surge, never below the minimum)
 *   commission = ORBIT's share of fullFare;  driverEarning = fullFare - commission
 *   discount   = promo, capped at the commission, so a promotion is paid from ORBIT's share and never from the driver's
 *   fare       = fullFare - discount   <- what the customer pays
 * On completion the ledger gets a driver line and an ORBIT line that add up to `fare`.
 * Cash trips: the driver already holds the cash, so their ledger line is marked `cashCollected` and they owe ORBIT the commission.
 */
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomInt } from 'node:crypto';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../common/auth.decorators';
import { GOODS_SPECS, VEHICLE_SPECS, VehicleSpec } from '../common/catalog';
import { isUniqueViolation } from '../common/db-errors';
import { computeFare, FareBreakdown, promoDiscount, surgeMultiplier } from '../common/fare';
import { LedgerKind, LedgerParty, PaymentMethod, Role, TripKind, TripStatus, VehicleType } from '../common/enums';
import { haversineM, MARKETS, Market, marketAt, marketOf } from '../common/markets';
import { scaleAmount } from '../common/money';
import { derivePin, pinMatches } from '../common/pin.util';
import { config } from '../config/config';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { GeoService, RouteResult } from '../geo/geo.service';
import { LocationService } from '../geo/location.service';
import { NotificationsService } from '../notifications/notifications.service';
import { money } from '../orders/order.alerts';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.entity';
import { MatchingService, Point } from './matching.service';
import { PromoCode, PromoRedemption, SosAlert, Trip, TripOffer } from './trip.entities';
import { TripEvents } from './trip.events';
import { ACTIVE_STATUSES, cancelFeeNow, dropPinOf, isLateCancel, startPinOf, toTripView, TripLens, TripView, WITH_DRIVER_STATUSES } from './trip.view';
import { CancelTripDto, CreateTripDto, QuoteTripDto, RateTripDto, SosDto } from './trips.dto';

/** The longest trip each light vehicle will be offered for, in km. Heavy vehicles have no limit beyond the country. */
const MAX_KM: Partial<Record<VehicleType, number>> = { BICYCLE: 8, MOTORCYCLE: 80, KEKE: 40, CAR: 150 };
const MIN_TRIP_M = 200;
/** Road time relative to a car, for light vehicles. Heavy vehicles are timed from their own average speed. */
const TIME_FACTOR: Partial<Record<VehicleType, number>> = { BICYCLE: 3, MOTORCYCLE: 0.85, KEKE: 1.15, CAR: 1 };
const RATE_WINDOW_MS = 7 * 86_400_000;
const TIP_WINDOW_MS = 86_400_000;
const SHARE_LIFETIME_MS = 2 * 3_600_000;
const LATE_CANCEL_LIMIT = 3;
const POSITION_TTL_MS = 30_000;

const geometryOf = (g: Array<[number, number]>, max = 150): Array<[number, number]> => {
  if (g.length <= max) return g.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
  const step = (g.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => g[Math.round(i * step)]).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as [number, number]);
};

const newCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `TRP-${ymd}-${Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
};

export interface QuoteOption {
  vehicleType: string; label: string; blurb: string; fleet: string; passengers: number; maxWeightKg: number;
  fare: number; surge: number; surgeAmount: number; durationS: number;
  etaMin: number | null; driversNearby: number; available: boolean;
}

export interface OfferView {
  tripId: string; code: string; kind: string; vehicleType: string; currency: string;
  secondsLeft: number; expiresAt: string; distanceToPickupM: number;
  pickup: { address: string; lat: number; lng: number }; drop: { address: string; lat: number; lng: number };
  distanceM: number; durationS: number; driverEarning: number; paymentMethod: string; surge: number;
  cargo: { passengers: number; goodsType: string | null; goodsLabel: string | null; careful: boolean; urgent: boolean; weightKg: number | null };
  customer: { firstName: string; rating: { average: number | null; count: number } } | null;
}

@Injectable()
export class TripsService implements OnModuleInit {
  /** Which trip a driver is on, so position updates reach the right customer without a database read each time. */
  private readonly onTrip = new Map<string, { tripId: string | null; customerId: string | null; until: number }>();

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(PromoRedemption) private readonly redemptions: Repository<PromoRedemption>,
    @InjectRepository(SosAlert) private readonly sos: Repository<SosAlert>,
    @InjectRepository(TripOffer) private readonly offers: Repository<TripOffer>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly geo: GeoService,
    private readonly location: LocationService,
    private readonly matching: MatchingService,
    private readonly events: TripEvents,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // While a driver is on a trip, their moving dot goes to that trip's customer (and nobody else).
    this.location.onUpdate(async (driverId, pos) => {
      const hit = await this.activeOf(driverId);
      if (hit?.tripId && hit.customerId) {
        this.realtime.courierMoved(hit.customerId, { tripId: hit.tripId, lat: pos.lat, lng: pos.lng, heading: pos.heading ?? null });
      }
    });
  }

  private remember(driverId: string, trip: { id: string; customerId: string } | null) {
    this.onTrip.set(driverId, { tripId: trip?.id ?? null, customerId: trip?.customerId ?? null, until: Date.now() + (trip ? POSITION_TTL_MS : 5_000) });
  }

  private async activeOf(driverId: string) {
    const hit = this.onTrip.get(driverId);
    if (hit && hit.until > Date.now()) return hit;
    const t = await this.trips.findOne({ where: { driverId, status: In(WITH_DRIVER_STATUSES) }, select: { id: true, customerId: true } });
    this.remember(driverId, t);
    return this.onTrip.get(driverId)!;
  }

  // ---- Pricing ---------------------------------------------------------------------------------

  private async plan(pickup: Point, drop: Point): Promise<{ market: Market; route: RouteResult }> {
    const a = marketAt(pickup, config.markets.enabled);
    const b = marketAt(drop, config.markets.enabled);
    if (!a || !b) throw new BadRequestException(`Pickup and drop-off must both be in a country ORBIT serves (${config.markets.enabled.join(', ')}).`);
    if (a.code !== b.code) throw new BadRequestException('A trip must start and end in the same country for now.');
    if (haversineM(pickup, drop) < MIN_TRIP_M) throw new BadRequestException('Pickup and drop-off are too close together for a trip.');
    return { market: a, route: await this.geo.route(pickup, drop, 'CAR' as VehicleType) };
  }

  private durationFor(route: RouteResult, spec: VehicleSpec): number {
    if (spec.fleet === 'HEAVY') return Math.round(route.distanceM / ((spec.avgKmh * 1000) / 3600));
    return Math.round(route.durationS * (TIME_FACTOR[spec.type] ?? 1));
  }

  private eligibleSpecs(dto: QuoteTripDto, distanceM: number): VehicleSpec[] {
    const within = (s: VehicleSpec) => distanceM <= (MAX_KM[s.type] ?? 3000) * 1000;
    const all = Object.values(VEHICLE_SPECS);
    if (dto.kind === TripKind.RIDE) {
      const need = dto.passengers ?? 1;
      return all.filter((s) => s.fleet === 'LIGHT' && s.passengers >= need && within(s));
    }
    if (!dto.weightKg) throw new BadRequestException('Tell us how heavy the goods are (weightKg) so we can suggest the right vehicle.');
    // The smallest vehicles that can carry it, so a 5 kg parcel is not quoted on a lorry.
    return all.filter((s) => s.maxWeightKg >= dto.weightKg! && within(s)).sort((x, y) => x.maxWeightKg - y.maxWeightKg).slice(0, 3);
  }

  private async price(spec: VehicleSpec, route: RouteResult, market: Market, pickup: Point, weightKg: number | null) {
    const durationS = this.durationFor(route, spec);
    const avail = await this.matching.availability(spec.type, pickup, weightKg);
    const surge = spec.fleet === 'LIGHT' ? surgeMultiplier(avail.demand, avail.supply, config.trips.maxSurge) : 1;
    const at = (s: number): FareBreakdown => computeFare({ tariff: spec.tariff, market, distanceM: route.distanceM, durationS, surge: s, commissionBps: config.trips.commissionBps });
    return { durationS, avail, surge, at };
  }

  async quote(dto: QuoteTripDto) {
    const { market, route } = await this.plan(dto.pickup, dto.drop);
    const specs = this.eligibleSpecs(dto, route.distanceM);
    if (specs.length === 0) throw new BadRequestException('No vehicle type can take this trip (too far, or too heavy). Try a shorter trip or split the load.');
    const options: QuoteOption[] = await Promise.all(specs.map(async (spec) => {
      const p = await this.price(spec, route, market, dto.pickup, dto.weightKg ?? null);
      const f = p.at(p.surge);
      return {
        vehicleType: spec.type, label: spec.label, blurb: spec.blurb, fleet: spec.fleet, passengers: spec.passengers, maxWeightKg: spec.maxWeightKg,
        fare: f.fare, surge: p.surge, surgeAmount: f.surgeAmount, durationS: p.durationS,
        etaMin: p.avail.nearestM === null ? null : Math.max(1, Math.ceil(((p.avail.nearestM * 1.3) / 1000 / spec.avgKmh) * 60)),
        driversNearby: p.avail.supply, available: p.avail.supply > 0,
      };
    }));
    return {
      kind: dto.kind, currency: market.currency, country: market.code,
      route: { distanceM: route.distanceM, durationS: route.durationS, geometry: geometryOf(route.geometry), source: route.source },
      options,
    };
  }

  /** Checks a promo for this person and currency. */
  private async promoFor(userId: string, code: string, currency: string): Promise<PromoCode> {
    const promo = await this.promos.findOne({ where: { code } });
    if (!promo || !promo.active) throw new BadRequestException('That promo code is not valid.');
    if (promo.currency !== currency) throw new BadRequestException(`That code is for trips in ${promo.currency}.`);
    if (promo.validUntil && new Date(promo.validUntil).getTime() < Date.now()) throw new BadRequestException('That promo code has expired.');
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) throw new BadRequestException('That promo code has been fully used.');
    if (await this.redemptions.exists({ where: { promoId: promo.id, userId } })) throw new BadRequestException('You have already used that promo code.');
    return promo;
  }

  async checkPromo(userId: string, code: string, currency?: string) {
    const cur = currency ?? marketOf(config.markets.enabled[0]).currency;
    const p = await this.promoFor(userId, code, cur);
    return { code: p.code, type: p.type, value: p.value, maxDiscount: p.maxDiscount, currency: p.currency, validUntil: p.validUntil ? new Date(p.validUntil).toISOString() : null };
  }

  // ---- Requesting ------------------------------------------------------------------------------

  private async assertCanRequest(customerId: string) {
    const active = await this.trips.findOne({ where: { customerId, status: In(ACTIVE_STATUSES) }, select: { id: true } });
    if (active) throw new ConflictException({ message: 'You already have a trip in progress.', code: 'TRIP_IN_PROGRESS', tripId: active.id });
    const recent = await this.trips.find({
      where: { customerId, lateCancel: true, cancelledAt: MoreThan(new Date(Date.now() - 86_400_000)) },
      order: { cancelledAt: 'DESC' }, take: LATE_CANCEL_LIMIT, select: { cancelledAt: true },
    });
    if (recent.length >= LATE_CANCEL_LIMIT) {
      const until = new Date(recent[0].cancelledAt!).getTime() + 3_600_000;
      if (until > Date.now()) {
        throw new HttpException(`You have cancelled several trips after a driver was on the way. You can request again in ${Math.ceil((until - Date.now()) / 60_000)} minutes.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  async create(user: AuthUser, dto: CreateTripDto): Promise<TripView> {
    await this.assertCanRequest(user.id);
    const { market, route } = await this.plan(dto.pickup, dto.drop);
    const spec = this.eligibleSpecs(dto, route.distanceM).find((s) => s.type === dto.vehicleType);
    if (!spec) throw new BadRequestException('That vehicle cannot take this trip (wrong type, too far, or too heavy).');

    const parcel = dto.kind === TripKind.PARCEL;
    if (parcel && (!dto.recipientName || !dto.recipientPhone)) throw new BadRequestException('Parcels need the recipient’s name and phone number.');

    const priced = await this.price(spec, route, market, dto.pickup, dto.weightKg ?? null);
    const accepted = dto.acceptedSurge ?? 1;
    if (priced.surge > accepted + 0.05) {
      throw new ConflictException({
        message: 'Prices went up because demand is high. Check the new price and confirm.', code: 'PRICE_CHANGED',
        current: { vehicleType: spec.type, surge: priced.surge, fare: priced.at(priced.surge).fare },
      });
    }
    const fare = priced.at(Math.max(1, Math.min(priced.surge, accepted)));
    const promo = dto.promoCode ? await this.promoFor(user.id, dto.promoCode, market.currency) : null;
    const discount = promo ? promoDiscount(promo, fare.fare, fare.commission) : 0;

    let trip: Trip;
    try {
      trip = await this.db.transaction(async (m) => {
        const t = await m.save(Trip, m.create(Trip, {
          code: newCode(), kind: dto.kind, status: TripStatus.SEARCHING, customerId: user.id, driverId: null, vehicleType: spec.type,
          country: market.code, currency: market.currency,
          pickupAddress: dto.pickup.address, pickupLat: dto.pickup.lat, pickupLng: dto.pickup.lng,
          dropAddress: dto.drop.address, dropLat: dto.drop.lat, dropLng: dto.drop.lng,
          distanceM: route.distanceM, durationS: priced.durationS, geometry: geometryOf(route.geometry),
          baseFare: fare.base, distanceFare: fare.distanceFare, timeFare: fare.timeFare, surge: fare.surge,
          fullFare: fare.fare, promoCode: promo?.code ?? null, discount, fare: fare.fare - discount,
          commission: fare.commission, driverEarning: fare.driverEarning, paymentMethod: dto.paymentMethod, paid: false,
          passengers: parcel ? 0 : dto.passengers ?? 1,
          goodsType: parcel ? dto.goodsType ?? 'GENERAL' : null, weightKg: parcel ? dto.weightKg ?? null : null,
          notes: dto.notes ?? null, recipientName: parcel ? dto.recipientName ?? null : null, recipientPhone: parcel ? dto.recipientPhone ?? null : null,
        }));
        if (promo) {
          // Count the use only while the code has uses left, so two people racing for the last use cannot both get it.
          const bumped = await m.createQueryBuilder().update(PromoCode).set({ usedCount: () => '"usedCount" + 1' })
            .where('id = :id', { id: promo.id })
            .andWhere(promo.maxUses !== null ? '"usedCount" < :max' : '1 = 1', { max: promo.maxUses ?? 0 }).execute();
          if (!bumped.affected) throw new BadRequestException('That promo code has just been fully used.');
          await m.insert(PromoRedemption, { promoId: promo.id, userId: user.id, tripId: t.id });
        }
        return t;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('You already have a trip in progress, or that promo code was just used.');
      throw e;
    }

    await this.matching.dispatch(trip.id);
    return this.view(await this.trips.findOneByOrFail({ id: trip.id }), 'customer');
  }

  // ---- Reading ---------------------------------------------------------------------------------

  /** Loads the people involved in a set of trips in one query, then builds each view. */
  private async views(rows: Trip[], lens: TripLens): Promise<TripView[]> {
    const ids = [...new Set(rows.flatMap((t) => [t.customerId, t.driverId]).filter((x): x is string => !!x))];
    const people = new Map((ids.length ? await this.users.find({ where: { id: In(ids) } }) : []).map((u) => [u.id, u]));
    return rows.map((t) => toTripView(t, lens, { driver: t.driverId ? people.get(t.driverId) : null, customer: people.get(t.customerId) }));
  }

  private async view(t: Trip, lens: TripLens): Promise<TripView> {
    return (await this.views([t], lens))[0];
  }

  /** The trip, and which side of it this person is on. Anyone else gets "not found" so trip ids cannot be probed. */
  private async partyOf(user: AuthUser, id: string): Promise<{ trip: Trip; lens: TripLens }> {
    const trip = await this.trips.findOneBy({ id });
    if (trip) {
      if (user.role === Role.ADMIN) return { trip, lens: 'admin' };
      if (trip.customerId === user.id) return { trip, lens: 'customer' };
      if (trip.driverId === user.id) return { trip, lens: 'driver' };
    }
    throw new NotFoundException('Trip not found.');
  }

  async get(user: AuthUser, id: string): Promise<TripView> {
    const { trip, lens } = await this.partyOf(user, id);
    return this.view(trip, lens);
  }

  async list(user: AuthUser, scope: 'active' | 'past', limit: number, offset: number): Promise<{ items: TripView[]; total: number }> {
    const mine = user.role === Role.RIDER ? { driverId: user.id } : { customerId: user.id };
    const lens: TripLens = user.role === Role.RIDER ? 'driver' : 'customer';
    const statuses = scope === 'active' ? In(ACTIVE_STATUSES) : In([TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.NO_DRIVER]);
    // A driver only has a trip once they accepted it; searching trips are offers, not theirs.
    const where = user.role === Role.RIDER && scope === 'active' ? { ...mine, status: In(WITH_DRIVER_STATUSES) } : { ...mine, status: statuses };
    const [rows, total] = await this.trips.findAndCount({ where, order: { requestedAt: 'DESC' }, take: Math.min(Math.max(limit, 1), 50), skip: Math.max(offset, 0) });
    return { items: await this.views(rows, lens), total };
  }

  async activeFor(user: AuthUser): Promise<TripView | null> {
    const { items } = await this.list(user, 'active', 1, 0);
    return items[0] ?? null;
  }

  /** Where the driver is right now, for the customer's map. */
  async tracking(user: AuthUser, id: string) {
    const { trip } = await this.partyOf(user, id);
    const live = WITH_DRIVER_STATUSES.includes(trip.status as TripStatus);
    const position = live && trip.driverId ? await this.location.currentOf(trip.driverId) : null;
    return { tripId: trip.id, status: trip.status, driver: position };
  }

  // ---- Driver: offers and progress -------------------------------------------------------------

  async offersFor(driverId: string): Promise<OfferView[]> {
    const me = await this.users.findOne({ where: { id: driverId }, select: { id: true, online: true } });
    if (!me?.online) return [];
    const live = await this.offers.find({ where: { driverId, status: 'OFFERED', expiresAt: MoreThan(new Date()) }, order: { createdAt: 'ASC' } });
    if (!live.length) return [];
    const rows = await this.trips.find({ where: { id: In(live.map((o) => o.tripId)), status: TripStatus.SEARCHING } });
    const byId = new Map(rows.map((t) => [t.id, t]));
    const customers = new Map((await this.users.find({ where: { id: In(rows.map((t) => t.customerId)) } })).map((u) => [u.id, u]));
    const out: OfferView[] = [];
    for (const o of live) {
      const t = byId.get(o.tripId);
      if (!t) continue;
      const c = customers.get(t.customerId);
      const goods = t.goodsType ? GOODS_SPECS[t.goodsType as keyof typeof GOODS_SPECS] : undefined;
      out.push({
        tripId: t.id, code: t.code, kind: t.kind, vehicleType: t.vehicleType, currency: t.currency,
        secondsLeft: Math.max(0, Math.round((new Date(o.expiresAt).getTime() - Date.now()) / 1000)), expiresAt: new Date(o.expiresAt).toISOString(),
        distanceToPickupM: o.distanceM,
        pickup: { address: t.pickupAddress, lat: t.pickupLat, lng: t.pickupLng }, drop: { address: t.dropAddress, lat: t.dropLat, lng: t.dropLng },
        distanceM: t.distanceM, durationS: t.durationS, driverEarning: t.driverEarning, paymentMethod: t.paymentMethod, surge: t.surge,
        cargo: { passengers: t.passengers, goodsType: t.goodsType, goodsLabel: goods?.label ?? null, careful: goods?.careful ?? false, urgent: goods?.urgent ?? false, weightKg: t.weightKg },
        customer: c ? { firstName: c.name.trim().split(/\s+/)[0], rating: { average: c.ratingCount ? Math.round((c.ratingSum / c.ratingCount) * 10) / 10 : null, count: c.ratingCount } } : null,
      });
    }
    return out;
  }

  async accept(driverId: string, tripId: string): Promise<TripView> {
    const trip = await this.matching.accept(driverId, tripId);
    this.remember(driverId, trip);
    await this.events.changed(trip, 'accepted');
    return this.view(trip, 'driver');
  }

  async decline(driverId: string, tripId: string): Promise<{ ok: true }> {
    await this.matching.decline(driverId, tripId);
    return { ok: true };
  }

  private async ownedByDriver(driverId: string, id: string): Promise<Trip> {
    const t = await this.trips.findOneBy({ id, driverId });
    if (!t) throw new NotFoundException('Trip not found.');
    return t;
  }

  async arrived(driverId: string, id: string): Promise<TripView> {
    const t = await this.ownedByDriver(driverId, id);
    const here = await this.location.currentOf(driverId);
    if (here) {
      const away = Math.round(haversineM(here, { lat: t.pickupLat, lng: t.pickupLng }));
      if (away > config.trips.arriveRadiusM) throw new ConflictException(`You are about ${away} m from the pickup point. Get closer, then tap “I’ve arrived”.`);
    }
    const res = await this.trips.update({ id, driverId, status: TripStatus.ACCEPTED }, { status: TripStatus.ARRIVED, arrivedAt: new Date() });
    if (!res.affected) throw new ConflictException('This trip is not waiting for you to arrive.');
    const after = await this.trips.findOneByOrFail({ id });
    await this.events.changed(after, 'arrived');
    return this.view(after, 'driver');
  }

  /** Checks a 4-digit PIN with the same brute-force limit as order deliveries: five wrong tries lock the trip. */
  private async checkPin(t: Trip, purpose: 'start' | 'drop', supplied?: string) {
    const locked = () => new HttpException('This trip is locked after too many wrong PINs. Contact ORBIT support.', 423);
    if (t.pinAttempts >= config.trips.maxPinAttempts) throw locked();
    if (!supplied) throw new BadRequestException(purpose === 'start' ? 'Ask the passenger for their 4-digit start PIN.' : 'Ask the recipient for their 4-digit delivery PIN.');
    const expected = purpose === 'start' ? startPinOf(t) : dropPinOf(t);
    if (pinMatches(expected, supplied)) return;
    await this.trips.increment({ id: t.id }, 'pinAttempts', 1);
    const left = config.trips.maxPinAttempts - (t.pinAttempts + 1);
    if (left <= 0) throw new HttpException('Too many wrong PINs. This trip is now locked. Contact ORBIT support.', 423);
    throw new ForbiddenException(`That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }

  async start(driverId: string, id: string, pin?: string): Promise<TripView> {
    const t = await this.ownedByDriver(driverId, id);
    if (t.status !== TripStatus.ARRIVED) throw new ConflictException('Mark that you have arrived first.');
    if (t.kind === TripKind.RIDE) await this.checkPin(t, 'start', pin); // the passenger reads their PIN out: proves the right person got in the right car
    const res = await this.trips.update({ id, driverId, status: TripStatus.ARRIVED }, { status: TripStatus.IN_PROGRESS, startedAt: new Date() });
    if (!res.affected) throw new ConflictException('This trip cannot be started right now.');
    const after = await this.trips.findOneByOrFail({ id });
    await this.events.changed(after, 'started');
    return this.view(after, 'driver');
  }

  async complete(driverId: string, id: string, pin?: string): Promise<TripView> {
    const t = await this.ownedByDriver(driverId, id);
    if (t.status !== TripStatus.IN_PROGRESS) throw new ConflictException('This trip is not in progress.');
    if (t.kind === TripKind.PARCEL) await this.checkPin(t, 'drop', pin); // the recipient reads their PIN out: proves the goods reached them
    const cash = t.paymentMethod === PaymentMethod.CASH;
    await this.db.transaction(async (m) => {
      const res = await m.update(Trip, { id, driverId, status: TripStatus.IN_PROGRESS }, { status: TripStatus.COMPLETED, completedAt: new Date(), paid: true });
      if (!res.affected) throw new ConflictException('This trip was already completed or changed.');
      const lines: Array<Partial<LedgerEntry>> = [
        { party: LedgerParty.COURIER, kind: LedgerKind.TRIP_EARNING, amount: t.driverEarning },
        { party: LedgerParty.PLATFORM, kind: LedgerKind.TRIP_COMMISSION, amount: t.fare - t.driverEarning }, // commission less any promo ORBIT paid for
      ];
      await m.insert(LedgerEntry, lines.filter((l) => l.amount! > 0).map((l) => ({
        ...l, orderId: t.id, source: 'TRIP' as const, cashCollected: cash, userId: t.driverId, currency: t.currency,
      })));
    });
    this.onTrip.delete(driverId);
    const after = await this.trips.findOneByOrFail({ id });
    await this.events.changed(after, 'completed');
    return this.view(after, 'driver');
  }

  async driverCancel(driverId: string, id: string): Promise<{ result: 'searching' | 'ended' }> {
    const t = await this.ownedByDriver(driverId, id);
    if (t.status !== TripStatus.ACCEPTED && t.status !== TripStatus.ARRIVED) {
      throw new ConflictException(t.status === TripStatus.IN_PROGRESS ? 'The trip has started. Complete it, or use SOS if you are in danger.' : 'This trip is already over.');
    }
    const result = await this.matching.dropByDriver(driverId, t);
    this.onTrip.delete(driverId);
    return { result };
  }

  // ---- Customer: cancel, rate, tip -------------------------------------------------------------

  private async ownedByCustomer(customerId: string, id: string): Promise<Trip> {
    const t = await this.trips.findOneBy({ id, customerId });
    if (!t) throw new NotFoundException('Trip not found.');
    return t;
  }

  async cancel(customerId: string, id: string, dto: CancelTripDto): Promise<TripView> {
    const t = await this.ownedByCustomer(customerId, id);
    if (t.status === TripStatus.IN_PROGRESS) throw new ConflictException('The trip has started. Ask your driver to end it, or use the SOS button if you feel unsafe.');
    if (![TripStatus.SEARCHING, TripStatus.ACCEPTED, TripStatus.ARRIVED].includes(t.status as TripStatus)) throw new ConflictException('This trip is already over.');
    const late = isLateCancel(t);
    const fee = cancelFeeNow(t);
    await this.db.transaction(async (m) => {
      const res = await m.update(Trip, { id, customerId, status: In([TripStatus.SEARCHING, TripStatus.ACCEPTED, TripStatus.ARRIVED]) }, {
        status: TripStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: 'CUSTOMER', cancelReason: dto.reason ?? null,
        lateCancel: late, cancelFee: fee, waveExpiresAt: null,
      });
      if (!res.affected) throw new ConflictException('This trip changed while you were cancelling. Check its status and try again.');
      if (fee > 0 && t.driverId) {
        const commission = Math.round((fee * config.trips.commissionBps) / 10_000);
        await m.insert(LedgerEntry, [
          { party: LedgerParty.COURIER, kind: LedgerKind.TRIP_EARNING, amount: fee - commission },
          { party: LedgerParty.PLATFORM, kind: LedgerKind.TRIP_COMMISSION, amount: commission },
        ].filter((l) => l.amount > 0).map((l) => ({ ...l, orderId: t.id, source: 'TRIP' as const, cashCollected: false, userId: t.driverId, currency: t.currency })));
      }
    });
    if (t.status === TripStatus.SEARCHING) await this.matching.withdraw(id);
    if (t.driverId) this.onTrip.delete(t.driverId);
    const after = await this.trips.findOneByOrFail({ id });
    if (!late) await this.events.releasePromo(after);
    if (t.driverId) await this.events.changed(after, 'cancelled_by_customer');
    else this.realtime.tripUpdated(after, [customerId]);
    return this.view(after, 'customer');
  }

  /** Both sides rate once, within a week of the trip. */
  async rate(user: AuthUser, id: string, dto: RateTripDto): Promise<TripView> {
    const { trip, lens } = await this.partyOf(user, id);
    if (lens === 'admin') throw new ForbiddenException('Only the customer and the driver can rate a trip.');
    if (trip.status !== TripStatus.COMPLETED || !trip.completedAt) throw new ConflictException('You can rate a trip once it is complete.');
    if (Date.now() - new Date(trip.completedAt).getTime() > RATE_WINDOW_MS) throw new ConflictException('The rating window for this trip has closed.');
    const customerSide = lens === 'customer';
    const res = await this.trips.update(
      customerSide ? { id, driverRating: IsNull() } : { id, customerRating: IsNull() },
      customerSide ? { driverRating: dto.rating, ratingComment: dto.comment ?? null } : { customerRating: dto.rating },
    );
    if (!res.affected) throw new ConflictException('You have already rated this trip.');
    const rated = customerSide ? trip.driverId : trip.customerId;
    if (rated) {
      await this.users.increment({ id: rated }, 'ratingSum', dto.rating);
      await this.users.increment({ id: rated }, 'ratingCount', 1);
    }
    return this.view(await this.trips.findOneByOrFail({ id }), lens);
  }

  /** Card trips only: cash tips are handed over directly. The tip goes to the driver in full. */
  async tip(customerId: string, id: string, amount: number): Promise<TripView> {
    const t = await this.ownedByCustomer(customerId, id);
    if (t.status !== TripStatus.COMPLETED || !t.completedAt) throw new ConflictException('You can tip once the trip is complete.');
    if (t.paymentMethod !== PaymentMethod.CARD) throw new ConflictException('In-app tips are for card trips. For cash trips, tip your driver directly.');
    if (Date.now() - new Date(t.completedAt).getTime() > TIP_WINDOW_MS) throw new ConflictException('The tipping window for this trip has closed.');
    const cap = Math.max(t.fullFare, scaleAmount(1000, MARKETS[t.country] ?? marketOf(config.markets.enabled[0])));
    if (amount > cap) throw new BadRequestException(`A tip can be at most ${money(cap, t.currency)}.`);
    await this.db.transaction(async (m) => {
      const res = await m.update(Trip, { id, customerId, tip: 0, status: TripStatus.COMPLETED }, { tip: amount });
      if (!res.affected) throw new ConflictException('You have already tipped for this trip.');
      await m.insert(LedgerEntry, { orderId: t.id, source: 'TRIP', cashCollected: false, party: LedgerParty.COURIER, userId: t.driverId, kind: LedgerKind.TRIP_TIP, amount, currency: t.currency });
    });
    await this.notifications.push([{ userId: t.driverId, type: 'trip.tip', title: 'You got a tip', body: `${money(amount, t.currency)} from a customer on ${t.code}.`, data: { tripId: t.id } }]);
    return this.view(await this.trips.findOneByOrFail({ id }), 'customer');
  }

  // ---- Safety: share and SOS -------------------------------------------------------------------

  /** A link anyone can open (no account) to follow the trip: first name, vehicle, plate and live position only. */
  async share(customerId: string, id: string): Promise<{ token: string }> {
    const t = await this.ownedByCustomer(customerId, id);
    if (!WITH_DRIVER_STATUSES.includes(t.status as TripStatus)) throw new ConflictException('You can share a trip once a driver has accepted it.');
    if (t.shareToken) return { token: t.shareToken };
    const token = randomBytes(18).toString('base64url');
    await this.trips.update({ id }, { shareToken: token });
    return { token };
  }

  async unshare(customerId: string, id: string): Promise<{ ok: true }> {
    await this.ownedByCustomer(customerId, id);
    await this.trips.update({ id }, { shareToken: null });
    return { ok: true };
  }

  async publicTrack(token: string) {
    const t = /^[A-Za-z0-9_-]{20,40}$/.test(token) ? await this.trips.findOneBy({ shareToken: token }) : null;
    const endedAt = t?.completedAt ?? t?.cancelledAt;
    if (!t || (endedAt && Date.now() - new Date(endedAt).getTime() > SHARE_LIFETIME_MS)) throw new NotFoundException('This trip link is no longer active.');
    const driver = t.driverId ? await this.users.findOne({ where: { id: t.driverId }, select: { id: true, name: true, ratingSum: true, ratingCount: true } }) : null;
    const live = WITH_DRIVER_STATUSES.includes(t.status as TripStatus);
    return {
      code: t.code, kind: t.kind, status: t.status,
      driver: driver ? { firstName: driver.name.trim().split(/\s+/)[0], rating: driver.ratingCount ? Math.round((driver.ratingSum / driver.ratingCount) * 10) / 10 : null } : null,
      vehicle: t.vehicleInfo, pickup: { address: t.pickupAddress, lat: t.pickupLat, lng: t.pickupLng }, drop: { address: t.dropAddress, lat: t.dropLat, lng: t.dropLng },
      geometry: t.geometry, position: live && t.driverId ? await this.location.currentOf(t.driverId) : null,
    };
  }

  /** Raises an emergency alert for ORBIT staff. Idempotent: asking twice for the same trip does not page twice. */
  async raiseSos(user: AuthUser, id: string, dto: SosDto): Promise<{ id: string; status: string }> {
    const { trip, lens } = await this.partyOf(user, id);
    if (lens === 'admin') throw new ForbiddenException('Only the customer and the driver can raise an alert.');
    if (!WITH_DRIVER_STATUSES.includes(trip.status as TripStatus)) throw new ConflictException('Alerts are for trips that are under way. In an emergency call your local emergency number.');
    const open = await this.sos.findOne({ where: { tripId: id, userId: user.id, status: 'OPEN' } });
    if (open) return { id: open.id, status: open.status };
    const here = dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : lens === 'driver' ? await this.location.currentOf(user.id) : null;
    const alert = await this.sos.save(this.sos.create({ tripId: id, userId: user.id, raisedBy: lens === 'driver' ? 'DRIVER' : 'CUSTOMER', lat: here?.lat ?? null, lng: here?.lng ?? null, note: dto.note ?? null }));
    const admins = await this.users.find({ where: { role: Role.ADMIN }, select: { id: true } });
    await this.notifications.push(admins.map((a) => ({
      userId: a.id, type: 'sos', title: 'Safety alert', body: `${lens === 'driver' ? 'A driver' : 'A customer'} raised an alert on ${trip.code}.`, data: { tripId: id, sosId: alert.id },
    })));
    this.realtime.adminChanged();
    return { id: alert.id, status: alert.status };
  }
}

