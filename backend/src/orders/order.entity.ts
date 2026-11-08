import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';
import { Fulfilment, OrderStatus } from '../common/enums';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';

/**
 * An order from one customer to one shop.
 *
 * Money fields are computed once at creation (see common/money.ts) and frozen on the order, so later
 * changes to fees or commission never rewrite history.
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-friendly waybill number, e.g. ORB-261106-7K2M. Shown on the digital waybill. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  waybillNo: string;

  @Index()
  @Column({ type: UUID_TYPE })
  customerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Index()
  @Column({ type: UUID_TYPE })
  shopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  /** The rider assigned to an ORBIT-courier delivery. Null until a rider accepts the job. */
  @Index()
  @Column({ type: UUID_TYPE, nullable: true })
  courierId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'courierId' })
  courier: User | null;

  @Column({ type: 'varchar', length: 24 })
  fulfilment: Fulfilment;

  @Index()
  @Column({ type: 'varchar', length: 24, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  // ---- Money (whole naira) -----------------------------------------------------------------------
  @Column({ type: 'int' }) subtotal: number;
  @Column({ type: 'int' }) deliveryFee: number;
  @Column({ type: 'int' }) total: number;
  @Column({ type: 'int' }) commission: number;
  @Column({ type: 'int', default: 0 }) courierPayout: number;
  @Column({ type: 'int', default: 0 }) platformDeliveryContribution: number;

  // ---- Delivery details --------------------------------------------------------------------------
  @Column({ type: 'varchar', length: 240, nullable: true }) deliveryAddress: string | null;
  @Column({ type: 'varchar', length: 240, nullable: true }) deliveryNote: string | null;
  @Column({ type: 'varchar', length: 30 }) contactPhone: string;

  /** Minutes the merchant said preparation will take (set when they confirm). */
  @Column({ type: 'int', nullable: true }) prepMinutes: number | null;

  // ---- Delivery PIN protection -------------------------------------------------------------------
  @Column({ type: 'int', default: 0 }) pinAttempts: number;
  @Column({ type: 'boolean', default: false }) pinLocked: boolean;

  // ---- Cancellation ------------------------------------------------------------------------------
  @Column({ type: 'varchar', length: 20, nullable: true }) cancelledBy: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) cancelReason: string | null;

  // ---- Review (customer rates the shop after delivery) -------------------------------------------
  @Column({ type: 'int', nullable: true }) rating: number | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) reviewText: string | null;

  // ---- Timeline ----------------------------------------------------------------------------------
  @CreateDateColumn() createdAt: Date;
  @Column({ type: DATETIME, nullable: true }) paidAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) confirmedAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) readyAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) pickedUpAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) deliveredAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) cancelledAt: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];
}

/** A line on an order. Name and price are snapshots so history survives catalogue edits. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: UUID_TYPE })
  productId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int' })
  unitPrice: number;

  @Column({ type: 'int' })
  qty: number;
}
