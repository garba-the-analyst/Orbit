/**
 * ORBIT operations: verification queue and the KPI snapshot defined in proposal section 12.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountStatus, Fulfilment, LedgerKind, LedgerParty, OrderStatus, PaymentStatus, Role, ShopStatus } from '../common/enums';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Order } from '../orders/order.entity';
import { OrderView, toOrderView } from '../orders/order.view';
import { OrdersService } from '../orders/orders.service';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';

export interface VerificationQueue {
  merchants: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string;
    shop: { id: string; name: string; category: string; address: string } | null;
  }>;
  riders: Array<{ userId: string; name: string; email: string; phone: string; vehicle: string | null; createdAt: string }>;
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
            shop: s ? { id: s.id, name: s.name, category: s.category, address: s.address } : null,
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
          createdAt: new Date(u.createdAt).toISOString(),
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
   * Live KPIs from proposal section 12 (marketplace, logistics, financial).
   * Computed on demand from the database; fine at pilot scale (hundreds of orders a month).
   */
  async kpis() {
    const [delivered, cancelledPaid, allOrders, ledger, payments] = await Promise.all([
      this.orders.find({ where: { status: OrderStatus.DELIVERED } }),
      this.orders
        .createQueryBuilder('o')
        .where('o.status = :s', { s: OrderStatus.CANCELLED })
        .andWhere('o.paidAt IS NOT NULL')
        .getCount(),
      this.orders.find({ select: { id: true, status: true, fulfilment: true } }),
      this.ledger.find(),
      this.payments.find({ where: { status: In([PaymentStatus.SUCCESS, PaymentStatus.REFUNDED]) } }),
    ]);

    const gmv = delivered.reduce((s, o) => s + o.subtotal, 0);
    const sumLedger = (party: LedgerParty, kind?: LedgerKind) =>
      ledger.filter((l) => l.party === party && (!kind || l.kind === kind)).reduce((s, l) => s + l.amount, 0);
    const platformRevenue = sumLedger(LedgerParty.PLATFORM);

    const byCustomer = new Map<string, number>();
    for (const o of delivered) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + 1);
    const buyers = byCustomer.size;
    const repeatBuyers = [...byCustomer.values()].filter((n) => n >= 2).length;

    const deliveries = delivered.filter((o) => o.fulfilment !== Fulfilment.PICKUP && o.paidAt && o.deliveredAt);
    const avgDeliveryMinutes = deliveries.length
      ? round1(
          deliveries.reduce((s, o) => s + (new Date(o.deliveredAt!).getTime() - new Date(o.paidAt!).getTime()), 0) /
            deliveries.length /
            60_000,
        )
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
      marketplace: {
        activeMerchants,
        listedProducts,
        completedOrders: delivered.length,
        gmv,
        averageBasket: delivered.length ? Math.round(gmv / delivered.length) : null,
        repeatPurchaseRatePct: pct(repeatBuyers, buyers),
        refundRatePct: pct(payments.filter((p) => p.status === PaymentStatus.REFUNDED).length, payments.length),
        openOrders: allOrders.filter((o) =>
          [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY].includes(o.status),
        ).length,
      },
      logistics: {
        courierDeliveries: delivered.filter((o) => o.fulfilment === Fulfilment.ORBIT_COURIER).length,
        averageDeliveryMinutes: avgDeliveryMinutes,
        orderCompletionRatePct: pct(delivered.length, delivered.length + cancelledPaid),
        activeRiders,
        onlineRiders,
      },
      financial: {
        platformRevenue,
        commission: sumLedger(LedgerParty.PLATFORM, LedgerKind.COMMISSION),
        deliveryContribution: sumLedger(LedgerParty.PLATFORM, LedgerKind.DELIVERY_CONTRIBUTION),
        contributionPerOrder: delivered.length ? Math.round(platformRevenue / delivered.length) : null,
        owedToMerchants: sumLedger(LedgerParty.MERCHANT),
        owedToRiders: sumLedger(LedgerParty.COURIER),
      },
      verificationQueue: { pendingMerchants, pendingRiders },
    };
  }
}
