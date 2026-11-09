/** ORBIT staff tools for trips: monitoring, unlocking, cancelling, promo codes, safety alerts and the mobility KPIs. */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LedgerParty, TripStatus } from '../common/enums';
import { marketOf } from '../common/markets';
import { config } from '../config/config';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.entity';
import { MatchingService } from './matching.service';
import { PromoCode, SosAlert, Trip } from './trip.entities';
import { TripEvents } from './trip.events';
import { ACTIVE_STATUSES, toTripView, TripView } from './trip.view';
import { CreatePromoDto } from './trips.dto';

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class TripsAdminService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(SosAlert) private readonly sos: Repository<SosAlert>,
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly matching: MatchingService,
    private readonly events: TripEvents,
    private readonly realtime: RealtimeService,
  ) {}

  async list(status: string | undefined, limit: number, offset: number): Promise<{ items: TripView[]; total: number }> {
    const where = status === 'active' ? { status: In(ACTIVE_STATUSES) } : status && (Object.values(TripStatus) as string[]).includes(status) ? { status } : {};
    const [rows, total] = await this.trips.findAndCount({ where, order: { requestedAt: 'DESC' }, take: Math.min(Math.max(limit, 1), 100), skip: Math.max(offset, 0) });
    const ids = [...new Set(rows.flatMap((t) => [t.customerId, t.driverId]).filter((x): x is string => !!x))];
    const people = new Map((ids.length ? await this.users.find({ where: { id: In(ids) } }) : []).map((u) => [u.id, u]));
    return { items: rows.map((t) => toTripView(t, 'admin', { driver: t.driverId ? people.get(t.driverId) : null, customer: people.get(t.customerId) })), total };
  }

  async unlockPin(id: string): Promise<void> {
    const res = await this.trips.update({ id }, { pinAttempts: 0 });
    if (!res.affected) throw new NotFoundException('Trip not found.');
  }

  /** Ends a stuck or unsafe trip without any fee to the customer. */
  async cancel(id: string, reason?: string): Promise<{ ok: true }> {
    const t = await this.trips.findOneBy({ id });
    if (!t) throw new NotFoundException('Trip not found.');
    const res = await this.trips.update({ id, status: In(ACTIVE_STATUSES) }, {
      status: TripStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: 'ADMIN', cancelReason: reason ?? 'Cancelled by ORBIT support.', waveExpiresAt: null, cancelFee: 0,
    });
    if (!res.affected) throw new ConflictException('That trip is already over.');
    await this.matching.withdraw(id);
    const after = await this.trips.findOneByOrFail({ id });
    await this.events.releasePromo(after);
    await this.events.changed(after, 'cancelled_by_admin');
    return { ok: true };
  }

  // ---- Promo codes -----------------------------------------------------------------------------

  listPromos() {
    return this.promos.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async createPromo(dto: CreatePromoDto): Promise<PromoCode> {
    if (dto.type === 'PERCENT' && dto.value > 100) throw new BadRequestException('A percentage code cannot be more than 100.');
    if (await this.promos.exists({ where: { code: dto.code } })) throw new ConflictException('That code already exists.');
    return this.promos.save(this.promos.create({
      code: dto.code, type: dto.type, value: dto.value, maxDiscount: dto.maxDiscount ?? null,
      currency: dto.currency ?? marketOf(config.markets.enabled[0]).currency,
      validUntil: dto.validDays ? new Date(Date.now() + dto.validDays * 86_400_000) : null, maxUses: dto.maxUses ?? null,
    }));
  }

  async setPromoActive(id: string, active: boolean): Promise<PromoCode> {
    const res = await this.promos.update({ id }, { active });
    if (!res.affected) throw new NotFoundException('Promo code not found.');
    return this.promos.findOneByOrFail({ id });
  }

  // ---- Safety alerts ---------------------------------------------------------------------------

  async listSos(status: 'OPEN' | 'RESOLVED') {
    const rows = await this.sos.find({ where: { status }, order: { createdAt: 'DESC' }, take: 100 });
    if (!rows.length) return [];
    const users = new Map((await this.users.find({ where: { id: In(rows.map((r) => r.userId)) }, select: { id: true, name: true, phone: true, role: true } })).map((u) => [u.id, u]));
    const trips = new Map((await this.trips.find({ where: { id: In(rows.map((r) => r.tripId).filter((x): x is string => !!x)) } })).map((t) => [t.id, t]));
    return rows.map((r) => {
      const t = r.tripId ? trips.get(r.tripId) : undefined;
      const u = users.get(r.userId);
      return {
        id: r.id, status: r.status, raisedBy: r.raisedBy, note: r.note, lat: r.lat, lng: r.lng, at: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null,
        person: u ? { name: u.name, phone: u.phone, role: u.role } : null,
        trip: t ? { id: t.id, code: t.code, status: t.status, kind: t.kind, pickup: t.pickupAddress, drop: t.dropAddress, vehicle: t.vehicleInfo } : null,
      };
    });
  }

  async resolveSos(id: string, note?: string): Promise<{ ok: true }> {
    const res = await this.sos.update({ id, status: 'OPEN' }, { status: 'RESOLVED', resolvedAt: new Date(), ...(note ? { note } : {}) });
    if (!res.affected) throw new ConflictException('That alert is already resolved, or does not exist.');
    this.realtime.adminChanged();
    return { ok: true };
  }

  // ---- KPIs ------------------------------------------------------------------------------------

  /** The mobility section of the admin dashboard. Every figure is a SQL aggregate over indexed columns. */
  async kpis(currency: string) {
    const base = () => this.trips.createQueryBuilder('t').where('t.currency = :c', { c: currency });
    const done = () => base().andWhere('t.status = :s', { s: TripStatus.COMPLETED });
    const [totals, byKind, ended, searching, onTheRoad, rated, openSos, ledgerRows] = await Promise.all([
      done().select('COUNT(*)', 'n').addSelect('COALESCE(SUM(t.fare), 0)', 'gmv').getRawOne<{ n: string; gmv: string }>(),
      done().select('t.kind', 'kind').addSelect('COUNT(*)', 'n').groupBy('t.kind').getRawMany<{ kind: string; n: string }>(),
      base().andWhere('t.status IN (:...s)', { s: [TripStatus.CANCELLED, TripStatus.NO_DRIVER] }).getCount(),
      base().andWhere('t.status = :s', { s: TripStatus.SEARCHING }).getCount(),
      base().andWhere('t.status IN (:...s)', { s: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] }).getCount(),
      base().andWhere('t.driverRating IS NOT NULL').orderBy('t.completedAt', 'DESC').select(['t.driverRating']).take(500).getMany(),
      this.sos.count({ where: { status: 'OPEN' } }),
      this.ledger.createQueryBuilder('l')
        .select('l.party', 'party').addSelect('l.kind', 'kind')
        .addSelect('COALESCE(SUM(l.amount), 0)', 'amount')
        .addSelect('COALESCE(SUM(CASE WHEN l.cashCollected THEN l.amount ELSE 0 END), 0)', 'cash')
        .where('l.source = :src', { src: 'TRIP' }).andWhere('l.currency = :c', { c: currency })
        .groupBy('l.party').addGroupBy('l.kind').getRawMany<{ party: string; kind: string; amount: string; cash: string }>(),
    ]);
    const completed = Number(totals?.n ?? 0);
    const sum = (party: LedgerParty, f: (r: { kind: string; amount: string; cash: string }) => number) => ledgerRows.filter((r) => r.party === party).reduce((s, r) => s + f(r), 0);
    return {
      completedTrips: completed,
      rides: Number(byKind.find((k) => k.kind === 'RIDE')?.n ?? 0),
      parcels: Number(byKind.find((k) => k.kind === 'PARCEL')?.n ?? 0),
      gmv: Number(totals?.gmv ?? 0),
      averageFare: completed ? Math.round(Number(totals?.gmv ?? 0) / completed) : null,
      completionRatePct: completed + ended ? round1((completed / (completed + ended)) * 100) : null,
      searchingNow: searching,
      onTheRoadNow: onTheRoad,
      averageDriverRating: rated.length ? round1(rated.reduce((s, t) => s + (t.driverRating ?? 0), 0) / rated.length) : null,
      openSafetyAlerts: openSos,
      platformRevenue: sum(LedgerParty.PLATFORM, (r) => Number(r.amount)),
      /** Earned by drivers on card trips and not yet paid out (cash trips are already in the driver's hands). */
      owedToDrivers: sum(LedgerParty.COURIER, (r) => Number(r.amount) - Number(r.cash)),
      /** Commission that drivers who took cash still owe ORBIT. */
      cashCommissionDue: sum(LedgerParty.PLATFORM, (r) => Number(r.cash)),
    };
  }
}
