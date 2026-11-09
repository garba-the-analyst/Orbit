/**
 * Earnings summaries for merchants and riders, computed from the append-only settlement ledger.
 * (Actual bank payouts are out of MVP scope; "earned" is what ORBIT owes the party once payouts run.)
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth.decorators';
import { LedgerParty, Role } from '../common/enums';
import { MARKETS, marketOf } from '../common/markets';
import { config } from '../config/config';
import { Order } from '../orders/order.entity';
import { Trip } from '../trips/trip.entities';
import { User } from '../users/user.entity';
import { LedgerEntry } from './ledger-entry.entity';

export interface EarningsSummary {
  currency: string;
  total: number;
  today: number;
  ordersSettled: number;
  tripsSettled: number;
  /** Drivers only. Card earnings ORBIT will pay out, cash the driver already holds, and commission owed on that cash. */
  payableByOrbit?: number;
  cashHeld?: number;
  owedToOrbit?: number;
  rating?: { average: number | null; count: number };
  /** Last 7 Lagos calendar days, oldest first. */
  last7Days: Array<{ date: string; amount: number }>;
  /** `orderId` is the order's or the trip's id; `waybillNo` is the order's waybill or the trip's code; `source` says which. */
  recent: Array<{ orderId: string; waybillNo: string; amount: number; kind: string; source: string; cash: boolean; at: string }>;
}

/** The calendar day in a market's time zone. None of the supported markets use daylight saving, so a fixed offset is exact. */
const dayIn = (d: Date, offsetMin: number) => new Date(d.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async summary(user: AuthUser): Promise<EarningsSummary> {
    const party = user.role === Role.RIDER ? LedgerParty.COURIER : LedgerParty.MERCHANT;
    const entries = await this.ledger.find({
      where: { userId: user.id, party },
      order: { createdAt: 'DESC' },
      take: 2000,
    });

    const currency = entries[0]?.currency ?? marketOf(config.markets.enabled[0]).currency;
    const offset = (Object.values(MARKETS).find((m) => m.currency === currency) ?? marketOf(config.markets.enabled[0])).utcOffsetMin;
    const lagosDay = (d: Date) => dayIn(d, offset);
    const todayKey = lagosDay(new Date());
    const days = new Map<string, number>();
    for (let i = 6; i >= 0; i--) days.set(lagosDay(new Date(Date.now() - i * 86_400_000)), 0);

    let total = 0;
    let today = 0;
    for (const e of entries) {
      total += e.amount;
      const key = lagosDay(new Date(e.createdAt));
      if (key === todayKey) today += e.amount;
      if (days.has(key)) days.set(key, days.get(key)! + e.amount);
    }

    const recentEntries = entries.slice(0, 15);
    const idsOf = (source: 'ORDER' | 'TRIP') => recentEntries.filter((e) => e.source === source).map((e) => e.orderId);
    const [orderRows, tripRows] = await Promise.all([
      idsOf('ORDER').length ? this.orders.find({ where: { id: In(idsOf('ORDER')) }, select: { id: true, waybillNo: true } }) : [],
      idsOf('TRIP').length ? this.trips.find({ where: { id: In(idsOf('TRIP')) }, select: { id: true, code: true } }) : [],
    ]);
    const waybill = new Map<string, string>([...orderRows.map((o) => [o.id, o.waybillNo] as const), ...tripRows.map((t) => [t.id, t.code] as const)]);

    let driverExtras: Pick<EarningsSummary, 'payableByOrbit' | 'cashHeld' | 'owedToOrbit' | 'rating'> = {};
    if (user.role === Role.RIDER) {
      const owed = await this.ledger.find({ where: { userId: user.id, party: LedgerParty.PLATFORM, cashCollected: true }, select: { amount: true } });
      const me = await this.users.findOne({ where: { id: user.id }, select: { ratingSum: true, ratingCount: true } });
      driverExtras = {
        payableByOrbit: entries.filter((e) => !e.cashCollected).reduce((s, e) => s + e.amount, 0),
        cashHeld: entries.filter((e) => e.cashCollected).reduce((s, e) => s + e.amount, 0),
        owedToOrbit: owed.reduce((s, e) => s + e.amount, 0),
        rating: { average: me && me.ratingCount ? Math.round((me.ratingSum / me.ratingCount) * 10) / 10 : null, count: me?.ratingCount ?? 0 },
      };
    }

    return {
      currency,
      total,
      today,
      ordersSettled: new Set(entries.filter((e) => e.source !== 'TRIP').map((e) => e.orderId)).size,
      tripsSettled: new Set(entries.filter((e) => e.source === 'TRIP').map((e) => e.orderId)).size,
      ...driverExtras,
      last7Days: [...days.entries()].map(([date, amount]) => ({ date, amount })),
      recent: recentEntries.map((e) => ({
        orderId: e.orderId,
        waybillNo: waybill.get(e.orderId) ?? '',
        amount: e.amount,
        kind: e.kind,
        source: e.source,
        cash: e.cashCollected,
        at: new Date(e.createdAt).toISOString(),
      })),
    };
  }
}
