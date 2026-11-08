/**
 * Earnings summaries for merchants and riders, computed from the append-only settlement ledger.
 * (Actual bank payouts are out of MVP scope; "earned" is what ORBIT owes the party once payouts run.)
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth.decorators';
import { LedgerParty, Role } from '../common/enums';
import { Order } from '../orders/order.entity';
import { LedgerEntry } from './ledger-entry.entity';

export interface EarningsSummary {
  total: number;
  today: number;
  ordersSettled: number;
  /** Last 7 Lagos calendar days, oldest first. */
  last7Days: Array<{ date: string; amount: number }>;
  recent: Array<{ orderId: string; waybillNo: string; amount: number; kind: string; at: string }>;
}

/** Nigeria is UTC+1 all year, so a fixed offset gives correct local calendar days. */
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async summary(user: AuthUser): Promise<EarningsSummary> {
    const party = user.role === Role.RIDER ? LedgerParty.COURIER : LedgerParty.MERCHANT;
    const entries = await this.ledger.find({
      where: { userId: user.id, party },
      order: { createdAt: 'DESC' },
      take: 2000,
    });

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
    const orderRows = recentEntries.length
      ? await this.orders.find({ where: { id: In(recentEntries.map((e) => e.orderId)) }, select: { id: true, waybillNo: true } })
      : [];
    const waybill = new Map(orderRows.map((o) => [o.id, o.waybillNo]));

    return {
      total,
      today,
      ordersSettled: new Set(entries.map((e) => e.orderId)).size,
      last7Days: [...days.entries()].map(([date, amount]) => ({ date, amount })),
      recent: recentEntries.map((e) => ({
        orderId: e.orderId,
        waybillNo: waybill.get(e.orderId) ?? '',
        amount: e.amount,
        kind: e.kind,
        at: new Date(e.createdAt).toISOString(),
      })),
    };
  }
}
