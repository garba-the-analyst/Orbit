/**
 * The order engine: creation, state transitions, delivery-PIN confirmation and settlement.
 *
 * Correctness principles
 * - Every state change is a conditional UPDATE (`WHERE status IN (...)`). If two requests race (two riders
 *   accepting the same job, a customer cancelling while the merchant confirms) exactly one wins and the
 *   other receives a clear 409 instead of corrupting the order.
 * - Stock is reserved when the order is created, with an atomic `stock >= qty` guard, and released on
 *   cancellation or payment timeout. Overselling is therefore impossible.
 * - Money is calculated once at creation and frozen on the order. Settlement splits the total into
 *   ledger lines that always sum back to the order total.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomInt } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull, LessThan, Repository } from 'typeorm';
import { AuthUser } from '../common/auth.decorators';
import {
  AccountStatus,
  Fulfilment,
  LedgerKind,
  LedgerParty,
  OrderStatus,
  PaymentStatus,
  Role,
  ShopStatus,
} from '../common/enums';
import { dominantGoods, fleetOfOrNull } from '../common/catalog';
import { marketOf } from '../common/markets';
import { computeCharges, scaleAmount } from '../common/money';
import { derivePin, pinMatches } from '../common/pin.util';
import { config } from '../config/config';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { GeoService } from '../geo/geo.service';
import { LocationService, Position } from '../geo/location.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { ShopRider } from '../shop-riders/shop-rider.entity';
import { VehiclesService } from '../vehicles/vehicles.service';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { CreateOrderDto, RateOrderDto } from './orders.dto';
import { OrderEvent, orderAlerts } from './order.alerts';
import { Order, OrderItem } from './order.entity';
import { OrderView, toOrderView } from './order.view';

const MAX_PIN_ATTEMPTS = 5;
const MAX_ACTIVE_JOBS_PER_RIDER = 2;
const WAYBILL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters (0/O, 1/I/L)

export interface PaymentIntent {
  reference: string;
  amount: number;
  provider: string;
}

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private sweeper?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ShopRider) private readonly shopRiders: Repository<ShopRider>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly geo: GeoService,
    private readonly location: LocationService,
    private readonly vehicles: VehiclesService,
  ) {
    // Drivers' positions flow to the customers whose orders they are carrying.
    this.location.onUpdate((riderId, pos) => this.relayCourierPosition(riderId, pos));
  }

  /** Which orders each driver is on, cached briefly so a stream of position pings is not a stream of queries. */
  private readonly activeCache = new Map<string, { until: number; targets: Array<{ orderId: string; customerId: string }> }>();

  private async relayCourierPosition(riderId: string, pos: Position) {
    let hit = this.activeCache.get(riderId);
    if (!hit || hit.until < Date.now()) {
      const rows = await this.orders.find({
        where: { courierId: riderId, status: In([OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY]) },
        select: { id: true, customerId: true },
      });
      hit = { until: Date.now() + 5000, targets: rows.map((r) => ({ orderId: r.id, customerId: r.customerId })) };
      this.activeCache.set(riderId, hit);
    }
    for (const t of hit.targets) {
      this.realtime.courierMoved(t.customerId, { orderId: t.orderId, lat: pos.lat, lng: pos.lng, heading: pos.heading ?? null });
    }
  }

  /**
   * Where the driver is and how far from where they are heading. Customers (and the shop and admins) see this for
   * deliveries in progress. The route has no turn-by-turn steps: those are for the driver.
   */
  async tracking(viewer: AuthUser, orderId: string) {
    const order = await this.load(orderId);
    const allowed = viewer.role === Role.ADMIN || order.customerId === viewer.id || order.shop.ownerId === viewer.id;
    if (!allowed) throw new NotFoundException('Order not found.');
    const live = [OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY].includes(order.status);
    const delivering = order.fulfilment === Fulfilment.ORBIT_COURIER || order.fulfilment === Fulfilment.MERCHANT_DELIVERY;
    if (!live || !delivering || !order.courierId) return { active: false, phase: null, courier: null, vehicle: null, destination: null, route: null };

    const [position, vehicle, rider] = await Promise.all([
      this.location.currentOf(order.courierId),
      this.vehicles.activeOf(order.courierId),
      this.users.findOne({ where: { id: order.courierId }, select: { name: true, vehicle: true } }),
    ]);
    const toShop = order.status !== OrderStatus.ON_THE_WAY;
    const destination = toShop
      ? order.shop.lat !== null && order.shop.lng !== null ? { lat: order.shop.lat, lng: order.shop.lng } : null
      : order.deliveryLat !== null && order.deliveryLng !== null ? { lat: order.deliveryLat, lng: order.deliveryLng } : null;
    const route = position && destination ? await this.geo.route(position, destination, (rider?.vehicle ?? 'MOTORCYCLE') as never) : null;
    return {
      active: true,
      phase: toShop ? 'to_shop' : 'to_you',
      courier: position ? { ...position, name: rider?.name?.split(' ')[0] ?? 'Your rider' } : null,
      vehicle: vehicle ? { type: vehicle.type, label: vehicle.label, plate: vehicle.plate, color: vehicle.color, model: vehicle.model } : null,
      destination,
      route: route ? { distanceM: route.distanceM, durationS: route.durationS, geometry: route.geometry, source: route.source } : null,
    };
  }

  onModuleInit() {
    if (config.isTest) return;
    // Cancel unpaid orders and release their stock once the payment window closes.
    this.sweeper = setInterval(() => {
      this.expireStalePayments().catch((err) => this.logger.error('Payment sweep failed', err));
    }, 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  // =====================================================================================================
  // Reading
  // =====================================================================================================

  /** Loads an order with its shop, customer and courier. Items are eager-loaded by the entity. */
  async load(id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { shop: true, customer: true, courier: true },
    });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  /**
   * Returns an order if the viewer is allowed to see it, otherwise 404 (never 403, so ids cannot be probed).
   * Riders may also open unclaimed courier jobs from the job board, in a redacted form.
   */
  async getFor(orderId: string, viewer: AuthUser): Promise<OrderView> {
    const order = await this.load(orderId);
    // Access follows the relationship to the order, not the account type: a shop owner can open what they bought
    // (as the customer) and what they sold (as the shop).
    const allowed =
      viewer.role === Role.ADMIN ||
      order.customerId === viewer.id ||
      order.shop.ownerId === viewer.id ||
      (viewer.role === Role.RIDER &&
        (order.courierId === viewer.id ||
          (order.fulfilment === Fulfilment.ORBIT_COURIER &&
            order.courierId === null &&
            [OrderStatus.CONFIRMED, OrderStatus.READY].includes(order.status))));
    if (!allowed) throw new NotFoundException('Order not found.');
    return toOrderView(order, viewer);
  }

  async listForCustomer(customerId: string): Promise<OrderView[]> {
    const rows = await this.orders.find({
      where: { customerId },
      relations: { shop: true, customer: true, courier: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => toOrderView(o, { id: customerId, role: Role.CUSTOMER }));
  }

  async listForMerchant(ownerId: string): Promise<OrderView[]> {
    const rows = await this.orders
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.shop', 'shop')
      .leftJoinAndSelect('o.customer', 'customer')
      .leftJoinAndSelect('o.courier', 'courier')
      .leftJoinAndSelect('o.items', 'items')
      .where('shop.ownerId = :ownerId', { ownerId })
      .andWhere('o.status != :pending', { pending: OrderStatus.PENDING_PAYMENT })
      .orderBy('o.createdAt', 'DESC')
      .take(100)
      .getMany();
    return rows.map((o) => toOrderView(o, { id: ownerId, role: Role.MERCHANT }));
  }

  // =====================================================================================================
  // Creating and paying
  // =====================================================================================================

  /**
   * Creates an order in PENDING_PAYMENT, reserves stock and opens a payment intent.
   * Prices always come from the database, never from the client.
   */
  async create(customer: AuthUser, dto: CreateOrderDto): Promise<{ order: OrderView; payment: PaymentIntent }> {
    const shop = await this.shops.findOne({ where: { id: dto.shopId, status: ShopStatus.APPROVED } });
    if (!shop) throw new NotFoundException('Shop not found.');
    if (shop.ownerId === customer.id) throw new BadRequestException('You cannot order from your own shop.');
    if (!shop.isOpen) throw new ConflictException(`${shop.name} is closed right now. Try again later.`);
    if (dto.fulfilment === Fulfilment.MERCHANT_DELIVERY && !shop.offersDelivery) {
      throw new BadRequestException(`${shop.name} does not deliver. Choose pickup, your own rider or an ORBIT courier.`);
    }

    // Merge duplicate lines so one product cannot be split to dodge the quantity cap.
    const wanted = new Map<string, number>();
    for (const line of dto.items) wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
    for (const qty of wanted.values()) {
      if (qty > config.business.maxQtyPerLine) {
        throw new BadRequestException(`You can order at most ${config.business.maxQtyPerLine} of one item.`);
      }
    }

    const products = await this.products.find({
      where: { id: In([...wanted.keys()]), shopId: shop.id, available: true },
    });
    if (products.length !== wanted.size) {
      throw new BadRequestException('Some items are no longer available. Refresh the shop and try again.');
    }

    // Services are booked with the shop: there is nothing to carry, so no courier and no collector.
    const hasService = products.some((p) => p.kind === 'SERVICE');
    if (hasService && dto.fulfilment !== Fulfilment.PICKUP && dto.fulfilment !== Fulfilment.MERCHANT_DELIVERY) {
      throw new BadRequestException('Services are booked with the shop. Choose pickup (you go to them) or shop delivery (they come to you).');
    }

    const subtotal = products.reduce((sum, p) => sum + p.price * wanted.get(p.id)!, 0);
    // ORBIT's delivery tariff is defined in naira and scaled to the shop's market (unchanged for Nigeria).
    const market = marketOf(shop.country);
    const charges = computeCharges({
      subtotal,
      fulfilment: dto.fulfilment,
      merchantDeliveryFee: shop.deliveryFee,
      commissionBps: config.business.commissionBps,
      orbitDeliveryFee: scaleAmount(config.business.orbitDeliveryFee, market),
      courierPayout: scaleAmount(config.business.courierPayout, market),
    });
    const goods = products.filter((p) => p.kind !== 'SERVICE');
    const goodsType = dominantGoods(goods.map((p) => p.goodsType));
    const weight = goods.reduce((sum, p) => sum + (p.weightKg ?? 0) * wanted.get(p.id)!, 0);
    const delivered = dto.fulfilment === Fulfilment.MERCHANT_DELIVERY || dto.fulfilment === Fulfilment.ORBIT_COURIER;
    const pinned = delivered && dto.deliveryLat !== undefined && dto.deliveryLng !== undefined;

    const account = await this.users.findOneByOrFail({ id: customer.id });

    const { orderId, payment } = await this.db.transaction(async (m) => {
      // Reserve stock. The conditional UPDATE succeeds only while enough units remain.
      for (const p of products) {
        if (p.kind === 'SERVICE') continue; // services have no stock
        const qty = wanted.get(p.id)!;
        const res = await m
          .createQueryBuilder()
          .update(Product)
          .set({ stock: () => `stock - ${Math.trunc(qty)}` })
          .where({ id: p.id, available: true })
          .andWhere('stock >= :qty', { qty })
          .execute();
        if (!res.affected) {
          throw new ConflictException(`Not enough ${p.name} in stock. Lower the quantity and try again.`);
        }
      }

      const order = await m.save(
        m.create(Order, {
          waybillNo: await this.newWaybill(m),
          customerId: customer.id,
          shopId: shop.id,
          fulfilment: dto.fulfilment,
          status: OrderStatus.PENDING_PAYMENT,
          subtotal: charges.subtotal,
          deliveryFee: charges.deliveryFee,
          total: charges.total,
          commission: charges.commission,
          courierPayout: charges.courierPayout,
          platformDeliveryContribution: charges.platformDeliveryContribution,
          currency: shop.currency,
          goodsType,
          weightKg: weight > 0 ? Math.round(weight * 100) / 100 : null,
          hasService,
          deliveryAddress: delivered ? (dto.deliveryAddress ?? null) : null,
          deliveryNote: delivered ? (dto.deliveryNote ?? null) : null,
          deliveryLat: pinned ? dto.deliveryLat! : null,
          deliveryLng: pinned ? dto.deliveryLng! : null,
          collectorName: dto.fulfilment === Fulfilment.CUSTOMER_RIDER ? (dto.collectorName ?? null) : null,
          collectorPhone: dto.fulfilment === Fulfilment.CUSTOMER_RIDER ? (dto.collectorPhone ?? null) : null,
          contactPhone: dto.contactPhone ?? account.phone,
          items: products.map((p) =>
            m.create(OrderItem, { productId: p.id, name: p.name, unitPrice: p.price, qty: wanted.get(p.id)!, kind: p.kind }),
          ),
        }),
      );

      const intent = await this.openPayment(m, order.id, order.total, order.currency);
      return { orderId: order.id, payment: intent };
    });

    const order = await this.load(orderId);
    return { order: toOrderView(order, { id: customer.id, role: Role.CUSTOMER }), payment };
  }

  /** Starts a fresh payment attempt for an unpaid order (e.g. after a failed card). */
  async retryPayment(customer: AuthUser, orderId: string): Promise<PaymentIntent> {
    const order = await this.load(orderId);
    if (order.customerId !== customer.id) throw new NotFoundException('Order not found.');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException('This order is not waiting for payment.');
    }
    return this.db.transaction(async (m) => {
      await m.update(Payment, { orderId, status: PaymentStatus.PENDING }, { status: PaymentStatus.FAILED });
      return this.openPayment(m, orderId, order.total, order.currency);
    });
  }

  private async openPayment(m: EntityManager, orderId: string, amount: number, currency: string): Promise<PaymentIntent> {
    const payment = await m.save(
      m.create(Payment, {
        orderId,
        reference: `ORB_${randomBytes(9).toString('hex')}`,
        amount,
        currency,
        provider: config.paymentProvider,
        status: PaymentStatus.PENDING,
      }),
    );
    return { reference: payment.reference, amount: payment.amount, provider: payment.provider };
  }

  /**
   * Applies a verified gateway result to the order. Safe to call more than once for the same payment
   * (gateways retry webhooks): only a PENDING payment is ever changed.
   */
  async applyPaymentResult(paymentId: string, success: boolean): Promise<void> {
    const result = await this.db.transaction(async (m): Promise<{ id: string; event?: OrderEvent } | null> => {
      const payment = await m.findOneByOrFail(Payment, { id: paymentId });

      // Duplicate callbacks change nothing. A FAILED payment is only reopened by a late *success*:
      // we closed it locally (order expired, or a newer attempt replaced it) but the gateway really
      // collected the money, so that money must be either applied or refunded, never ignored.
      const alreadySettled = payment.status === PaymentStatus.SUCCESS || payment.status === PaymentStatus.REFUNDED;
      if (alreadySettled || (payment.status === PaymentStatus.FAILED && !success)) return null;

      const order = await m.findOneByOrFail(Order, { id: payment.orderId });
      if (!success) {
        await m.update(Payment, { id: payment.id }, { status: PaymentStatus.FAILED });
        return { id: order.id };
      }

      if (order.status === OrderStatus.PENDING_PAYMENT) {
        const now = new Date();
        await m.update(Payment, { id: payment.id }, { status: PaymentStatus.SUCCESS, paidAt: now });
        await m.update(Order, { id: order.id }, { status: OrderStatus.PLACED, paidAt: now });
        // Close any other open attempts; if one of them also succeeds later it will be refunded.
        await m.update(Payment, { orderId: order.id, status: PaymentStatus.PENDING }, { status: PaymentStatus.FAILED });
        return { id: order.id, event: 'placed' };
      } else {
        // Money arrived after the order was cancelled or expired: refund it rather than keep it.
        await m.update(Payment, { id: payment.id }, { status: PaymentStatus.REFUNDED, paidAt: new Date() });
        return { id: order.id, event: 'refunded_late' };
      }
    });

    if (result) {
      const order = await this.load(result.id);
      this.notify(order);
      if (result.event) this.alert(order, result.event);
    }
  }

  // =====================================================================================================
  // Cancellation
  // =====================================================================================================

  /** Customers can cancel until the merchant confirms the order. */
  async cancelByCustomer(customer: AuthUser, orderId: string, reason?: string): Promise<OrderView> {
    const order = await this.load(orderId);
    if (order.customerId !== customer.id) throw new NotFoundException('Order not found.');
    const updated = await this.cancel(orderId, [OrderStatus.PENDING_PAYMENT, OrderStatus.PLACED], 'CUSTOMER', reason ?? 'Cancelled by customer');
    return toOrderView(updated, { id: customer.id, role: Role.CUSTOMER });
  }

  /** Merchants can decline a new order, or cancel a confirmed one that they cannot fulfil (e.g. sold out). */
  async cancelByMerchant(ownerId: string, orderId: string, reason?: string): Promise<OrderView> {
    await this.ownedOrder(orderId, ownerId);
    const updated = await this.cancel(
      orderId,
      [OrderStatus.PLACED, OrderStatus.CONFIRMED],
      'MERCHANT',
      reason ?? 'The shop could not fulfil this order',
    );
    return toOrderView(updated, { id: ownerId, role: Role.MERCHANT });
  }

  /** Cancels unpaid orders whose payment window has closed. Returns how many were cancelled. */
  async expireStalePayments(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - config.business.pendingPaymentTtlMin * 60_000);
    const stale = await this.orders.find({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: LessThan(cutoff) },
      select: { id: true },
    });
    let cancelled = 0;
    for (const { id } of stale) {
      try {
        await this.cancel(id, [OrderStatus.PENDING_PAYMENT], 'SYSTEM', 'Payment was not completed in time');
        cancelled += 1;
      } catch {
        /* paid or cancelled in the meantime: fine */
      }
    }
    return cancelled;
  }

  /** Shared cancellation: state change, stock release and refund happen atomically. */
  private async cancel(orderId: string, from: OrderStatus[], by: string, reason: string): Promise<Order> {
    await this.db.transaction(async (m) => {
      const res = await m.update(
        Order,
        { id: orderId, status: In(from) },
        { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: by, cancelReason: reason.slice(0, 200) },
      );
      if (!res.affected) {
        throw new ConflictException('This order can no longer be cancelled because it has already moved on.');
      }
      const items = await m.find(OrderItem, { where: { orderId } });
      for (const item of items) {
        if (item.kind === 'SERVICE') continue; // services never held stock
        await m
          .createQueryBuilder()
          .update(Product)
          .set({ stock: () => `stock + ${Math.trunc(item.qty)}` })
          .where({ id: item.productId })
          .execute();
      }
      await m.update(Payment, { orderId, status: PaymentStatus.SUCCESS }, { status: PaymentStatus.REFUNDED });
      await m.update(Payment, { orderId, status: PaymentStatus.PENDING }, { status: PaymentStatus.FAILED });
    });
    const order = await this.load(orderId);
    this.notify(order);
    this.alert(order, 'cancelled');
    return order;
  }

  // =====================================================================================================
  // Merchant actions
  // =====================================================================================================

  private async ownedOrder(orderId: string, ownerId: string): Promise<Order> {
    const order = await this.load(orderId);
    if (order.shop.ownerId !== ownerId) throw new NotFoundException('Order not found.');
    return order;
  }

  /** Merchant accepts a paid order and states how long it will take. */
  async accept(ownerId: string, orderId: string, prepMinutes?: number): Promise<OrderView> {
    const order = await this.ownedOrder(orderId, ownerId);
    const updated = await this.transition(orderId, [OrderStatus.PLACED], {
      status: OrderStatus.CONFIRMED,
      confirmedAt: new Date(),
      prepMinutes: prepMinutes ?? order.shop.prepMinutes,
    }, 'confirmed');
    return toOrderView(updated, { id: ownerId, role: Role.MERCHANT });
  }

  /** Merchant marks the order packed and ready. Courier jobs become pick-up-able for the assigned rider. */
  async markReady(ownerId: string, orderId: string): Promise<OrderView> {
    await this.ownedOrder(orderId, ownerId);
    const updated = await this.transition(orderId, [OrderStatus.CONFIRMED], {
      status: OrderStatus.READY,
      readyAt: new Date(),
    }, 'ready');
    return toOrderView(updated, { id: ownerId, role: Role.MERCHANT });
  }

  /**
   * Merchant sends out a MERCHANT_DELIVERY order, either themselves or with one of their own riders. A shop rider
   * must have accepted the shop's invitation; they see the address and can complete the delivery with the PIN.
   */
  async startOwnDelivery(ownerId: string, orderId: string, riderId?: string): Promise<OrderView> {
    const order = await this.ownedOrder(orderId, ownerId);
    if (order.fulfilment !== Fulfilment.MERCHANT_DELIVERY) {
      throw new BadRequestException('Only orders you deliver yourself can be sent out from here.');
    }
    if (riderId) {
      const link = await this.shopRiders.findOne({ where: { shopId: order.shopId, riderId, status: 'ACTIVE' } });
      const rider = link ? await this.users.findOne({ where: { id: riderId, role: Role.RIDER, status: AccountStatus.ACTIVE } }) : null;
      if (!rider) throw new BadRequestException('Choose one of your own riders who has accepted your invitation.');
    }
    const updated = await this.transition(orderId, [OrderStatus.READY], {
      status: OrderStatus.ON_THE_WAY,
      pickedUpAt: new Date(),
      courierId: riderId ?? null,
    }, 'picked_up');
    return toOrderView(updated, { id: ownerId, role: Role.MERCHANT });
  }

  // =====================================================================================================
  // Rider actions
  // =====================================================================================================

  /** A rider takes an unclaimed courier job. Atomic: only one rider can win. */
  async claim(rider: AuthUser, orderId: string): Promise<OrderView> {
    const riderRow = await this.users.findOneByOrFail({ id: rider.id });
    if (fleetOfOrNull(riderRow.vehicle) === 'HEAVY') {
      throw new ConflictException('Heavy-goods vehicles take logistics requests, not shop deliveries.');
    }
    if (!riderRow.online) throw new ConflictException('Go online to accept jobs.');

    const active = await this.orders.count({
      where: { courierId: rider.id, status: In([OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY]) },
    });
    if (active >= MAX_ACTIVE_JOBS_PER_RIDER) {
      throw new ConflictException(`You can carry ${MAX_ACTIVE_JOBS_PER_RIDER} jobs at a time. Finish one first.`);
    }

    const res = await this.orders.update(
      {
        id: orderId,
        fulfilment: Fulfilment.ORBIT_COURIER,
        courierId: IsNull(),
        status: In([OrderStatus.CONFIRMED, OrderStatus.READY]),
      },
      { courierId: rider.id },
    );
    const order = await this.load(orderId);
    if (!res.affected || order.courierId !== rider.id) {
      throw new ConflictException('Another rider already took this job.');
    }
    this.notify(order);
    this.alert(order, 'claimed');
    return toOrderView(order, { id: rider.id, role: Role.RIDER });
  }

  /** A rider gives a job back before picking it up; it returns to the job board. */
  async release(rider: AuthUser, orderId: string): Promise<OrderView> {
    const res = await this.orders.update(
      { id: orderId, courierId: rider.id, status: In([OrderStatus.CONFIRMED, OrderStatus.READY]) },
      { courierId: null },
    );
    if (!res.affected) throw new ConflictException('You can only give back a job you have not picked up yet.');
    const order = await this.load(orderId);
    this.notify(order, rider.id);
    return toOrderView(order, { id: rider.id, role: Role.RIDER });
  }

  /** Rider collects the parcel from the shop (the merchant must have marked it ready). */
  async pickUp(rider: AuthUser, orderId: string): Promise<OrderView> {
    const res = await this.orders.update(
      { id: orderId, courierId: rider.id, status: OrderStatus.READY },
      { status: OrderStatus.ON_THE_WAY, pickedUpAt: new Date() },
    );
    if (!res.affected) throw new ConflictException('This order is not ready for pickup yet.');
    const order = await this.load(orderId);
    this.notify(order);
    this.alert(order, 'picked_up');
    return toOrderView(order, { id: rider.id, role: Role.RIDER });
  }

  // =====================================================================================================
  // Delivery confirmation and settlement
  // =====================================================================================================

  /**
   * Completes an order by verifying the customer's 4-digit PIN.
   *  - PICKUP / CUSTOMER_RIDER: the merchant enters it while the order is READY (the customer, or the rider
   *                       they sent, shows it at the counter).
   *  - MERCHANT_DELIVERY: the merchant, or the shop rider they assigned, enters it while ON_THE_WAY.
   *  - ORBIT_COURIER:     the assigned rider enters it while the order is ON_THE_WAY.
   * Five wrong attempts lock the order so the PIN cannot be brute-forced.
   */
  async complete(actor: AuthUser, orderId: string, pin: string): Promise<OrderView> {
    const order = await this.load(orderId);

    const handover = order.fulfilment === Fulfilment.PICKUP || order.fulfilment === Fulfilment.CUSTOMER_RIDER;
    const expectedStatus = handover ? OrderStatus.READY : OrderStatus.ON_THE_WAY;
    const isOwner = actor.role === Role.MERCHANT && order.shop.ownerId === actor.id;
    const isCourier = actor.role === Role.RIDER && order.courierId === actor.id;
    const authorised =
      order.fulfilment === Fulfilment.ORBIT_COURIER
        ? isCourier
        : order.fulfilment === Fulfilment.MERCHANT_DELIVERY
          ? isOwner || isCourier
          : isOwner;
    if (!authorised) throw new NotFoundException('Order not found.');
    if (order.status !== expectedStatus) {
      throw new ConflictException(
        handover
          ? 'This order is not ready to hand over yet.'
          : 'This order is not out for delivery.',
      );
    }
    if (order.pinLocked) {
      throw new HttpException('This order is locked after too many wrong PINs. Contact ORBIT support.', 423);
    }

    if (!pinMatches(derivePin(order.id, config.pinSecret), pin)) {
      await this.orders.increment({ id: order.id }, 'pinAttempts', 1);
      const after = await this.orders.findOneByOrFail({ id: order.id });
      if (after.pinAttempts >= MAX_PIN_ATTEMPTS) {
        await this.orders.update({ id: order.id }, { pinLocked: true });
        throw new HttpException('Too many wrong PINs. This order is now locked. Contact ORBIT support.', 423);
      }
      const left = MAX_PIN_ATTEMPTS - after.pinAttempts;
      throw new BadRequestException(`That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
    }

    await this.db.transaction(async (m) => {
      const res = await m.update(
        Order,
        { id: order.id, status: expectedStatus },
        { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
      );
      if (!res.affected) throw new ConflictException('This order has already been completed.');
      await this.settle(m, order);
    });

    const done = await this.load(order.id);
    this.notify(done);
    this.alert(done, 'delivered');
    return toOrderView(done, { id: actor.id, role: actor.role });
  }

  /**
   * Splits the order total into ledger lines. By construction:
   *   merchant + courier + platform == order total.
   */
  private async settle(m: EntityManager, order: Order): Promise<void> {
    const lines: Array<Pick<LedgerEntry, 'party' | 'userId' | 'kind' | 'amount'>> = [
      { party: LedgerParty.MERCHANT, userId: order.shop.ownerId, kind: LedgerKind.SALE_NET, amount: order.subtotal - order.commission },
      { party: LedgerParty.PLATFORM, userId: null, kind: LedgerKind.COMMISSION, amount: order.commission },
    ];
    if (order.fulfilment === Fulfilment.MERCHANT_DELIVERY) {
      lines.push({ party: LedgerParty.MERCHANT, userId: order.shop.ownerId, kind: LedgerKind.MERCHANT_DELIVERY_FEE, amount: order.deliveryFee });
    }
    if (order.fulfilment === Fulfilment.ORBIT_COURIER) {
      lines.push(
        { party: LedgerParty.COURIER, userId: order.courierId, kind: LedgerKind.DELIVERY_PAYOUT, amount: order.courierPayout },
        { party: LedgerParty.PLATFORM, userId: null, kind: LedgerKind.DELIVERY_CONTRIBUTION, amount: order.platformDeliveryContribution },
      );
    }
    await m.save(
      lines.filter((l) => l.amount > 0).map((l) => m.create(LedgerEntry, { orderId: order.id, currency: order.currency, ...l })),
    );
  }

  // =====================================================================================================
  // Reviews
  // =====================================================================================================

  /** One review per delivered order; it feeds the shop's average rating. */
  async rate(customer: AuthUser, orderId: string, dto: RateOrderDto): Promise<OrderView> {
    const order = await this.load(orderId);
    if (order.customerId !== customer.id) throw new NotFoundException('Order not found.');
    if (order.status !== OrderStatus.DELIVERED) throw new ConflictException('You can rate an order after it is delivered.');

    const res = await this.orders.update(
      { id: orderId, rating: IsNull() },
      { rating: dto.rating, reviewText: dto.comment ?? null },
    );
    if (!res.affected) throw new ConflictException('You have already rated this order.');

    await this.shops.increment({ id: order.shopId }, 'ratingSum', dto.rating);
    await this.shops.increment({ id: order.shopId }, 'ratingCount', 1);
    return toOrderView(await this.load(orderId), { id: customer.id, role: Role.CUSTOMER });
  }

  // =====================================================================================================
  // Internals
  // =====================================================================================================

  /** Conditional state change. Fails with 409 if the order is not in one of the expected states. */
  private async transition(orderId: string, from: OrderStatus[], patch: Partial<Order>, event?: OrderEvent): Promise<Order> {
    const res = await this.orders.update({ id: orderId, status: In(from) }, patch as never);
    if (!res.affected) {
      throw new ConflictException('This order has already moved on. Refresh to see the latest status.');
    }
    const order = await this.load(orderId);
    this.notify(order);
    if (event) this.alert(order, event);
    return order;
  }

  /** Pushes a tiny change signal to everyone involved (details are fetched over authenticated REST). */
  private notify(order: Order, extraUserId?: string) {
    this.activeCache.clear(); // who is carrying what may have just changed
    this.realtime.orderUpdated(order, [order.customerId, order.shop.ownerId, order.courierId, extraUserId]);
    if (order.fulfilment === Fulfilment.ORBIT_COURIER) this.realtime.jobsChanged();
  }

  /** Tells the people involved, in words, what just happened. Fire and forget: it never blocks or breaks the order. */
  private alert(order: Order, event: OrderEvent) {
    void this.notifications.push(orderAlerts(order, event));
  }

  /** What a customer can put back in the basket from a past order, with today's prices and stock. */
  async reorderLines(user: AuthUser, orderId: string) {
    const order = await this.load(orderId);
    if (order.customerId !== user.id) throw new NotFoundException('Order not found.');
    const products = await this.products.find({
      where: { id: In(order.items.map((i) => i.productId)), shopId: order.shopId },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      shopId: order.shopId,
      shopName: order.shop.name,
      shopOpen: order.shop.isOpen,
      lines: order.items.map((i) => {
        const p = byId.get(i.productId);
        const available = !!p && p.available && (p.kind === 'SERVICE' || p.stock > 0);
        const qty = p && p.kind !== 'SERVICE' ? Math.max(1, Math.min(i.qty, p.stock)) : i.qty;
        return { productId: i.productId, name: i.name, qty, unitPrice: p?.price ?? i.unitPrice, available };
      }),
    };
  }

  private async newWaybill(m: EntityManager): Promise<string> {
    const d = new Date();
    const stamp = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) suffix += WAYBILL_ALPHABET[randomInt(WAYBILL_ALPHABET.length)];
      const code = `ORB-${stamp}-${suffix}`;
      if (!(await m.exists(Order, { where: { waybillNo: code } }))) return code;
    }
    throw new ConflictException('Could not generate a waybill number. Try again.');
  }

  /** Used by the admin module. */
  async unlockPin(orderId: string): Promise<void> {
    const res = await this.orders.update({ id: orderId }, { pinLocked: false, pinAttempts: 0 });
    if (!res.affected) throw new NotFoundException('Order not found.');
  }

  /** Guard for controllers that must not expose other people's orders. */
  assertCustomer(user: AuthUser) {
    if (user.role !== Role.CUSTOMER) throw new ForbiddenException('Only customers can do this.');
  }
}
