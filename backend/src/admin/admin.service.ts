/**
 * ORBIT operations: verification queue and the KPI snapshot defined in proposal section 12.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountStatus, Fulfilment, LedgerKind, LedgerParty, OrderStatus, PaymentStatus, Role, ShopStatus } from '../common/enums';
import { marketOf } from '../common/markets';
import { config } from '../config/config';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Order } from '../orders/order.entity';
import { OrderView, toOrderView } from '../orders/order.view';
import { OrdersService } from '../orders/orders.service';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { DocumentsService, DocumentView } from '../uploads/documents.service';
import { Shop } from '../shops/shop.entity';
import { VehiclesService, VehicleView } from '../vehicles/vehicles.service';
import { User } from '../users/user.entity';

export interface VerificationQueue {
  merchants: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string;
    shop: { id: string; name: string; category: string; address: string; city: string } | null;
    documents: DocumentView[];
  }>;
  riders: Array<{ userId: string; name: string; email: string; phone: string; vehicle: string | null; fleet: string | null; createdAt: string; vehicles: VehicleView[]; documents: DocumentView[] }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den === 0 ? null : round1((num / den) * 100));

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
    private readonly ordersService: OrdersService,
    private readonly realtime: RealtimeService,
    private readonly vehicleService: VehiclesService,
    private readonly documents: DocumentsService,
  ) {}

  /** Merchants and riders waiting for verification, oldest first. */
  async queue(): Promise<VerificationQueue> {
    const pending = await this.users.find({
      where: { status: AccountStatus.PENDING, role: In([Role.MERCHANT, Role.RIDER]) },
      order: { createdAt: 'ASC' },
    });
    // Skip the lookup when nobody is waiting: an empty IN () list is invalid SQL on some databases.
    const shops = pending.length ? await this.shops.find({ where: { ownerId: In(pending.map((u) => u.id)) } }) : [];
    const shopByOwner = new Map(shops.map((s) => [s.ownerId, s]));
    const docs = await this.documents.summaryFor(pending.map((u) => u.id));
    const vehicleRows = await Promise.all(pending.filter((u) => u.role === Role.RIDER).map(async (u) => [u.id, await this.vehicleService.list(u.id)] as const));
    const vehiclesByOwner = new Map(vehicleRows);

    return {
      merchants: pending
        .filter((u) => u.role === Role.MERCHANT)
        .map((u) => {
          const s = shopByOwner.get(u.id);
          return {
            userId: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            createdAt: new Date(u.createdAt).toISOString(),
            shop: s ? { id: s.id, name: s.name, category: s.category, address: s.address, city: s.city } : null,
            documents: docs.get(u.id) ?? [],
          };
        }),
      riders: pending
        .filter((u) => u.role === Role.RIDER)
        .map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          vehicle: u.vehicle,
          fleet: u.fleet,
          createdAt: new Date(u.createdAt).toISOString(),
          vehicles: vehiclesByOwner.get(u.id) ?? [],
          documents: docs.get(u.id) ?? [],
        })),
    };
  }

  /** Approves a pending merchant (and opens their shop) or rider. */
  async approve(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || ![Role.MERCHANT, Role.RIDER].includes(user.role)) throw new NotFoundException('Account not found.');
    if (user.status !== AccountStatus.PENDING) throw new BadRequestException('This account is not waiting for verification.');

    user.status = AccountStatus.ACTIVE;
    await this.users.save(user);
    if (user.role === Role.MERCHANT) {
      await this.shops.update({ ownerId: user.id }, { status: ShopStatus.APPROVED, isOpen: true });
    }
    // Approving a driver also approves the vehicle(s) they registered, so one click is enough.
    if (user.role === Role.RIDER) await this.vehicleService.approvePendingFor(user.id);
    this.realtime.userUpdated(user.id);
    this.realtime.adminChanged();
  }

  /** Suspends any merchant or rider. Their sessions stop working immediately. */
  async suspend(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || ![Role.MERCHANT, Role.RIDER, Role.CUSTOMER].includes(user.role)) throw new NotFoundException('Account not found.');
    user.status = AccountStatus.SUSPENDED;
    user.online = false;
    await this.users.save(user);
    if (user.role === Role.MERCHANT) {
      await this.shops.update({ ownerId: user.id }, { status: ShopStatus.SUSPENDED, isOpen: false });
    }
    this.realtime.userUpdated(user.id);
    this.realtime.adminChanged();
  }

  /** Recent orders across the platform, for support and dispute handling. */
  async recentOrders(adminId: string): Promise<OrderView[]> {
    const rows = await this.orders.find({
      relations: { shop: true, customer: true, courier: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => toOrderView(o, { id: adminId, role: Role.ADMIN }));
  }

  /** Re-opens PIN entry on a locked order after support has verified the customer. */
  unlockPin(orderId: string) {
    return this.ordersService.unlockPin(orderId);
  }

  /**
   * Live KPIs from proposal section 12 (marketplace, logistics, financial), for one currency at a time: amounts in
   * different currencies must never be added together. Everything is computed by the database with aggregate
   * queries, so cost grows with the number of rows scanned by an index, not with rows loaded into memory.
   */
  async kpis(currencyIn?: string) {
    const currency = currencyIn ?? marketOf(config.markets.enabled[0]).currency;
    const open = [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY];
    const delivered = () => this.orders.createQueryBuilder('o').where('o.status = :d', { d: OrderStatus.DELIVERED }).andWhere('o.currency = :c', { c: currency });

    const [totals, buyers, repeat, courierDeliveries, cancelledPaid, openOrders, ledgerRows, paymentRows, recent, currencyRows] = await Promise.all([
      delivered().select('COUNT(*)', 'n').addSelect('COALESCE(SUM(o.subtotal), 0)', 'gmv').getRawOne<{ n: string; gmv: string }>(),
      delivered().select('COUNT(DISTINCT o.customerId)', 'n').getRawOne<{ n: string }>(),
      this.orders.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'n')
        .from((qb) => qb.select('o.customerId', 'customerId').from(Order, 'o').where('o.status = :d', { d: OrderStatus.DELIVERED }).andWhere('o.currency = :c', { c: currency }).groupBy('o.customerId').having('COUNT(*) >= 2'), 't')
        .setParameters({ d: OrderStatus.DELIVERED, c: currency })
        .getRawOne<{ n: string }>(),
      delivered().andWhere('o.fulfilment = :f', { f: Fulfilment.ORBIT_COURIER }).getCount(),
      this.orders.createQueryBuilder('o').where('o.status = :s', { s: OrderStatus.CANCELLED }).andWhere('o.paidAt IS NOT NULL').andWhere('o.currency = :c', { c: currency }).getCount(),
      this.orders.createQueryBuilder('o').where('o.status IN (:...open)', { open }).andWhere('o.currency = :c', { c: currency }).getCount(),
      this.ledger.createQueryBuilder('l').select('l.party', 'party').addSelect('l.kind', 'kind').addSelect('SUM(l.amount)', 'amount').where('l.currency = :c', { c: currency }).groupBy('l.party').addGroupBy('l.kind').getRawMany<{ party: string; kind: string; amount: string }>(),
      this.payments.createQueryBuilder('p').select('p.status', 'status').addSelect('COUNT(*)', 'n').where('p.currency = :c', { c: currency }).andWhere('p.status IN (:...s)', { s: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] }).groupBy('p.status').getRawMany<{ status: string; n: string }>(),
      // Average over the latest 500 delivered orders that travelled: bounded work however large the history is.
      delivered().andWhere('o.fulfilment != :pk', { pk: Fulfilment.PICKUP }).andWhere('o.fulfilment != :cr', { cr: Fulfilment.CUSTOMER_RIDER }).andWhere('o.paidAt IS NOT NULL').andWhere('o.deliveredAt IS NOT NULL').orderBy('o.deliveredAt', 'DESC').select(['o.paidAt', 'o.deliveredAt']).take(500).getMany(),
      this.orders.createQueryBuilder('o').select('DISTINCT o.currency', 'currency').getRawMany<{ currency: string }>(),
    ]);

    const completed = Number(totals?.n ?? 0);
    const gmv = Number(totals?.gmv ?? 0);
    const buyerCount = Number(buyers?.n ?? 0);
    const repeatBuyers = Number(repeat?.n ?? 0);
    const ledgerSum = (party: LedgerParty, kind?: LedgerKind) =>
      ledgerRows.filter((r) => r.party === party && (!kind || r.kind === kind)).reduce((s, r) => s + Number(r.amount), 0);
    const platformRevenue = ledgerSum(LedgerParty.PLATFORM);
    const refunded = Number(paymentRows.find((r) => r.status === PaymentStatus.REFUNDED)?.n ?? 0);
    const paymentTotal = paymentRows.reduce((s, r) => s + Number(r.n), 0);
    const avgDeliveryMinutes = recent.length
      ? round1(recent.reduce((s, o) => s + (new Date(o.deliveredAt!).getTime() - new Date(o.paidAt!).getTime()), 0) / recent.length / 60_000)
      : null;

    const [activeMerchants, listedProducts, activeRiders, onlineRiders, pendingMerchants, pendingRiders] = await Promise.all([
      this.shops.count({ where: { status: ShopStatus.APPROVED } }),
      this.products.count({ where: { available: true } }),
      this.users.count({ where: { role: Role.RIDER, status: AccountStatus.ACTIVE } }),
      this.users.count({ where: { role: Role.RIDER, status: AccountStatus.ACTIVE, online: true } }),
      this.users.count({ where: { role: Role.MERCHANT, status: AccountStatus.PENDING } }),
      this.users.count({ where: { role: Role.RIDER, status: AccountStatus.PENDING } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      currency,
      currencies: currencyRows.map((r) => r.currency),
      marketplace: {
        activeMerchants,
        listedProducts,
        completedOrders: completed,
        gmv,
        averageBasket: completed ? Math.round(gmv / completed) : null,
        repeatPurchaseRatePct: pct(repeatBuyers, buyerCount),
        refundRatePct: pct(refunded, paymentTotal),
        openOrders,
      },
      logistics: {
        courierDeliveries,
        averageDeliveryMinutes: avgDeliveryMinutes,
        orderCompletionRatePct: pct(completed, completed + cancelledPaid),
        activeRiders,
        onlineRiders,
      },
      financial: {
        platformRevenue,
        commission: ledgerSum(LedgerParty.PLATFORM, LedgerKind.COMMISSION),
        deliveryContribution: ledgerSum(LedgerParty.PLATFORM, LedgerKind.DELIVERY_CONTRIBUTION),
        contributionPerOrder: completed ? Math.round(platformRevenue / completed) : null,
        owedToMerchants: ledgerSum(LedgerParty.MERCHANT),
        owedToRiders: ledgerSum(LedgerParty.COURIER),
      },
      verificationQueue: { pendingMerchants, pendingRiders },
    };
  }
}
