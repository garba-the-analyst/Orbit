/**
 * Driver matching: who is offered a trip, in what order, and what happens when nobody answers.
 *
 * - A trip is offered to the nearest eligible drivers in waves (default 3 drivers, 20 seconds each, up to 3 waves).
 *   Each wave looks further out than the last. Whoever accepts first wins; the rest are told it is gone.
 * - "Eligible" means: online, account active, an approved active vehicle of the requested type that can carry the
 *   load, a recent GPS position, and not already on a trip or a delivery.
 * - All transitions are conditional UPDATEs ("only if the trip is still SEARCHING in wave N"), so two API servers,
 *   a slow sweeper and a fast driver can race without double-offering or double-assigning. A database index also
 *   guarantees one active trip per driver.
 * - A sweeper advances waves whose offers ran out. State lives in the database, so a restart loses nothing.
 */
import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { VEHICLE_SPECS } from '../common/catalog';
import { isUniqueViolation } from '../common/db-errors';
import { AccountStatus, OrderStatus, Role, TripKind, TripStatus, VehicleType } from '../common/enums';
import { haversineM } from '../common/markets';
import { config } from '../config/config';
import { NotificationsService } from '../notifications/notifications.service';
import { Order } from '../orders/order.entity';
import { money } from '../orders/order.alerts';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Trip, TripOffer } from './trip.entities';
import { TripEvents } from './trip.events';

export type Point = { lat: number; lng: number };

/** A latitude/longitude box around a point, used to narrow candidates before measuring exact distances. */
export function boxAround(p: Point, km: number) {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
  return { south: p.lat - dLat, north: p.lat + dLat, west: p.lng - dLng, east: p.lng + dLng };
}

export const waveRadiusKm = (vehicleType: string, wave: number) =>
  Math.min(400, VEHICLE_SPECS[vehicleType as VehicleType].searchRadiusKm * (1 + 0.5 * Math.max(0, wave - 1)));

export interface Candidate { driverId: string; distanceM: number }

@Injectable()
export class MatchingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Matching');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripOffer) private readonly offers: Repository<TripOffer>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly events: TripEvents,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (config.trips.sweepMs > 0) {
      this.timer = setInterval(() => void this.sweep().catch((e: Error) => this.log.error(`Sweep failed: ${e.message}`)), config.trips.sweepMs);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- Finding drivers -------------------------------------------------------------------------

  /** Eligible drivers near a pickup, nearest first. */
  async availableDrivers(o: { pickup: Point; vehicleType: string; radiusKm: number; weightKg?: number | null; exclude?: string[]; limit: number }): Promise<Candidate[]> {
    const box = boxAround(o.pickup, o.radiusKm);
    const fresh = new Date(Date.now() - config.trips.staleLocationSec * 1000);
    const near = await this.users.find({
      where: {
        role: Role.RIDER, status: AccountStatus.ACTIVE, online: true,
        locationAt: MoreThan(fresh), lat: Between(box.south, box.north), lng: Between(box.west, box.east),
      },
      select: { id: true, lat: true, lng: true },
      take: 500,
    });
    const exclude = new Set(o.exclude ?? []);
    const candidates = near
      .filter((u) => !exclude.has(u.id) && u.lat !== null && u.lng !== null)
      .map((u) => ({ driverId: u.id, distanceM: haversineM(o.pickup, { lat: u.lat!, lng: u.lng! }) }))
      .filter((c) => c.distanceM <= o.radiusKm * 1000);
    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.driverId);
    const [vehicles, busyTrips, busyOrders] = await Promise.all([
      this.vehicles.find({ where: { ownerId: In(ids), isActive: true, status: 'APPROVED', type: o.vehicleType }, select: { ownerId: true, capacityKg: true } }),
      this.trips.find({ where: { driverId: In(ids), status: In([TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS]) }, select: { driverId: true } }),
      this.orders.find({ where: { courierId: In(ids), status: In([OrderStatus.READY, OrderStatus.ON_THE_WAY]) }, select: { courierId: true } }),
    ]);
    const cap = new Map(vehicles.map((v) => [v.ownerId, v.capacityKg ?? VEHICLE_SPECS[o.vehicleType as VehicleType].maxWeightKg]));
    const busy = new Set([...busyTrips.map((t) => t.driverId), ...busyOrders.map((x) => x.courierId)]);
    return candidates
      .filter((c) => cap.has(c.driverId) && !busy.has(c.driverId) && (o.weightKg == null || cap.get(c.driverId)! >= o.weightKg))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, o.limit);
  }

  /** How many requests are waiting and how many drivers are free around a pickup. Drives the quote's ETA and surge. */
  async availability(vehicleType: string, pickup: Point, weightKg?: number | null) {
    const radiusKm = VEHICLE_SPECS[vehicleType as VehicleType].searchRadiusKm;
    const box = boxAround(pickup, radiusKm);
    const [drivers, waiting] = await Promise.all([
      this.availableDrivers({ pickup, vehicleType, radiusKm, weightKg, limit: 100 }),
      this.trips.count({ where: { status: TripStatus.SEARCHING, vehicleType, pickupLat: Between(box.south, box.north), pickupLng: Between(box.west, box.east) } }),
    ]);
    return { supply: drivers.length, demand: waiting + 1, nearestM: drivers[0]?.distanceM ?? null };
  }

  // ---- Offer waves -----------------------------------------------------------------------------

  /** Starts matching for a new trip. */
  dispatch(tripId: string): Promise<void> {
    return this.advance(tripId, 0);
  }

  /**
   * Moves a trip from wave `fromWave` to the next. Only one caller wins the conditional update, so a trip is never
   * offered twice for the same wave. A wave with nobody to offer to widens the search straight away.
   */
  async advance(tripId: string, fromWave: number): Promise<void> {
    let from = fromWave;
    for (;;) {
      const trip = await this.trips.findOneBy({ id: tripId });
      if (!trip || trip.status !== TripStatus.SEARCHING || trip.wave !== from) return;
      const next = from + 1;
      if (next > config.trips.maxWaves) {
        const res = await this.trips.update(
          { id: tripId, status: TripStatus.SEARCHING, wave: from },
          { status: TripStatus.NO_DRIVER, waveExpiresAt: null, cancelledAt: new Date(), cancelledBy: 'SYSTEM', cancelReason: 'No driver was available nearby. Try again shortly, or choose another vehicle.' },
        );
        if (res.affected) {
          await this.expireOffers(tripId);
          const done = await this.trips.findOneByOrFail({ id: tripId });
          await this.events.releasePromo(done);
          await this.events.changed(done, 'no_driver');
        }
        return;
      }
      const expires = new Date(Date.now() + config.trips.offerTtlSec * 1000);
      const claimed = await this.trips.update({ id: tripId, status: TripStatus.SEARCHING, wave: from }, { wave: next, waveExpiresAt: expires });
      if (!claimed.affected) return;
      const offered = await this.offerWave({ ...trip, wave: next }, expires);
      if (offered > 0) {
        this.realtime.tripUpdated(trip, [trip.customerId]);
        return;
      }
      from = next;
    }
  }

  private async offerWave(trip: Trip, expires: Date): Promise<number> {
    const already = (await this.offers.find({ where: { tripId: trip.id }, select: { driverId: true } })).map((o) => o.driverId);
    const picks = await this.availableDrivers({
      pickup: { lat: trip.pickupLat, lng: trip.pickupLng }, vehicleType: trip.vehicleType,
      radiusKm: waveRadiusKm(trip.vehicleType, trip.wave), weightKg: trip.weightKg, exclude: already, limit: config.trips.waveSize,
    });
    const made: Candidate[] = [];
    for (const p of picks) {
      try {
        await this.offers.insert({ tripId: trip.id, driverId: p.driverId, wave: trip.wave, status: 'OFFERED', expiresAt: expires, distanceM: Math.round(p.distanceM) });
        made.push(p);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // someone else offered this driver already: skip
      }
    }
    if (made.length) {
      this.realtime.offersChanged(made.map((m) => m.driverId));
      await this.notifications.push(made.map((m) => ({
        userId: m.driverId, type: 'trip.offer',
        title: trip.kind === TripKind.RIDE ? 'New ride request' : 'New delivery request',
        body: `${(m.distanceM / 1000).toFixed(1)} km to pickup · earn ${money(trip.driverEarning, trip.currency)}`,
        data: { tripId: trip.id },
      })));
    }
    return made.length;
  }

  private async expireOffers(tripId: string) {
    const live = await this.offers.find({ where: { tripId, status: 'OFFERED' }, select: { id: true, driverId: true } });
    if (!live.length) return;
    await this.offers.update({ tripId, status: 'OFFERED' }, { status: 'EXPIRED' });
    this.realtime.offersChanged(live.map((o) => o.driverId));
  }

  /** Withdraws the live offers of a trip (it was cancelled), telling those drivers. */
  withdraw(tripId: string) {
    return this.expireOffers(tripId);
  }

  // ---- Driver answers --------------------------------------------------------------------------

  async decline(driverId: string, tripId: string): Promise<void> {
    const res = await this.offers.update({ tripId, driverId, status: 'OFFERED' }, { status: 'DECLINED' });
    if (!res.affected) return;
    const trip = await this.trips.findOneBy({ id: tripId });
    if (!trip || trip.status !== TripStatus.SEARCHING) return;
    const waiting = await this.offers.count({ where: { tripId, wave: trip.wave, status: 'OFFERED', expiresAt: MoreThan(new Date()) } });
    if (waiting === 0) await this.advance(tripId, trip.wave);
  }

  /** A driver who is on a trip or a delivery cannot take another. */
  async assertFree(driverId: string): Promise<void> {
    const [onTrip, onOrder] = await Promise.all([
      this.trips.count({ where: { driverId, status: In([TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS]) } }),
      this.orders.count({ where: { courierId: driverId, status: In([OrderStatus.READY, OrderStatus.ON_THE_WAY]) } }),
    ]);
    if (onTrip > 0) throw new ConflictException('Finish your current trip first.');
    if (onOrder > 0) throw new ConflictException('Finish your current delivery first.');
  }

  async accept(driverId: string, tripId: string): Promise<Trip> {
    const me = await this.users.findOneByOrFail({ id: driverId });
    if (!me.online) throw new ConflictException('Go online to accept requests.');
    const offer = await this.offers.findOne({ where: { tripId, driverId, status: 'OFFERED', expiresAt: MoreThan(new Date()) } });
    if (!offer) throw new ConflictException('This request is no longer available.');
    await this.assertFree(driverId);

    const vehicle = await this.vehicles.findOne({ where: { ownerId: driverId, isActive: true, status: 'APPROVED' } });
    if (!vehicle) throw new ConflictException('You need an approved active vehicle to take requests.');
    const trip = await this.trips.findOneBy({ id: tripId });
    if (!trip || vehicle.type !== trip.vehicleType) throw new ConflictException('This request needs a different vehicle.');

    let won = false;
    try {
      const res = await this.trips.update(
        { id: tripId, status: TripStatus.SEARCHING, driverId: IsNull() },
        {
          status: TripStatus.ACCEPTED, driverId, acceptedAt: new Date(), waveExpiresAt: null,
          vehicleInfo: { type: vehicle.type, label: VEHICLE_SPECS[vehicle.type as VehicleType].label, make: vehicle.make, model: vehicle.model, color: vehicle.color, plate: vehicle.plate },
        },
      );
      won = !!res.affected;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Finish your current trip first.');
      throw e;
    }
    if (!won) throw new ConflictException('Another driver took this request, or the customer cancelled.');

    await this.offers.update({ id: offer.id }, { status: 'ACCEPTED' });
    await this.expireOffers(tripId); // the other drivers' offers are now void
    return this.trips.findOneByOrFail({ id: tripId });
  }

  /**
   * A driver gives up a trip they had accepted. It goes back to searching (the driver is never offered it again).
   * After two such drops the trip ends so the customer is not stuck in a loop.
   */
  async dropByDriver(driverId: string, trip: Trip): Promise<'searching' | 'ended'> {
    const ended = trip.redispatches >= 2;
    const res = await this.trips.update(
      { id: trip.id, driverId, status: In([TripStatus.ACCEPTED, TripStatus.ARRIVED]) },
      ended
        ? { status: TripStatus.NO_DRIVER, driverId: null, vehicleInfo: null, cancelledAt: new Date(), cancelledBy: 'SYSTEM', cancelReason: 'Drivers were not able to take this trip. Please try again.' }
        : { status: TripStatus.SEARCHING, driverId: null, vehicleInfo: null, acceptedAt: null, arrivedAt: null, wave: 0, waveExpiresAt: null, redispatches: trip.redispatches + 1 },
    );
    if (!res.affected) throw new ConflictException('You can only drop a trip you have not started.');
    // Earlier offers are cleared so other drivers can be asked again; the dropping driver's row stays so they are skipped.
    await this.offers.delete({ tripId: trip.id, driverId: Not(driverId) });
    await this.offers.update({ tripId: trip.id, driverId }, { status: 'DECLINED' });
    const after = await this.trips.findOneByOrFail({ id: trip.id });
    if (ended) {
      await this.events.releasePromo(after);
      await this.events.changed(after, 'no_driver');
      return 'ended';
    }
    await this.events.changed(after, 'redispatched');
    await this.advance(trip.id, 0);
    return 'searching';
  }

  // ---- Sweeper ---------------------------------------------------------------------------------

  /** Expires unanswered offers and moves their trips to the next wave. Safe to run on several servers at once. */
  async sweep(): Promise<number> {
    const now = new Date();
    const stale = await this.offers.find({ where: { status: 'OFFERED', expiresAt: LessThan(now) }, take: 500, select: { id: true, driverId: true } });
    if (stale.length) {
      await this.offers.update({ id: In(stale.map((o) => o.id)) }, { status: 'EXPIRED' });
      this.realtime.offersChanged(stale.map((o) => o.driverId));
    }
    const due = await this.trips.find({ where: { status: TripStatus.SEARCHING, waveExpiresAt: LessThan(now) }, select: { id: true, wave: true }, take: 50 });
    // A trip that never got its first wave (the server stopped right after saving it) is picked up too.
    const orphaned = await this.trips.find({
      where: { status: TripStatus.SEARCHING, wave: 0, waveExpiresAt: IsNull(), requestedAt: LessThan(new Date(now.getTime() - 15_000)) },
      select: { id: true, wave: true }, take: 20,
    });
    for (const t of [...due, ...orphaned]) {
      await this.advance(t.id, t.wave).catch((e: Error) => this.log.error(`Could not advance ${t.id}: ${e.message}`));
    }
    return due.length + orphaned.length;
  }
}
