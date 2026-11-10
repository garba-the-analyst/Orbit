import { UUID_TYPE } from '../database/column-types';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ShopStatus } from '../common/enums';
import { User } from '../users/user.entity';

/** A verified local shop or food vendor selling on ORBIT. One shop per merchant account in the MVP. */
@Entity('shops')
@Index(['country', 'status'])
@Index(['lat', 'lng'])
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: UUID_TYPE })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 400, default: '' })
  description: string;

  /** One of SHOP_CATEGORIES (common/catalog.ts). */
  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 200 })
  address: string;

  /** Signage colour for the shop's storefront fascia, as a hex value. */
  /** ISO country code of the market the shop trades in. Decides the currency its prices are in. */
  @Column({ type: 'varchar', length: 2, default: 'NG' })
  country: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 60, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 60, default: '' })
  state: string;

  /** Where the shop is on the map. Null until the owner pins it; unpinned shops are not shown by distance. */
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  coverUrl: string | null;

  /** Business phone number shown to customers. */
  @Column({ type: 'varchar', length: 30, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  openingHours: string;

  @Column({ type: 'varchar', length: 9, default: '#1F4FBF' })
  color: string;

  @Column({ type: 'varchar', length: 20, default: ShopStatus.PENDING })
  status: ShopStatus;

  /** Merchants toggle this to stop receiving orders (closed for the day, sold out, etc.). */
  @Column({ type: 'boolean', default: true })
  isOpen: boolean;

  /** Typical minutes to prepare an order; shown to customers and used as the default at confirmation. */
  @Column({ type: 'int', default: 15 })
  prepMinutes: number;

  /** Whether the merchant can deliver orders with their own staff. */
  @Column({ type: 'boolean', default: false })
  offersDelivery: boolean;

  /** The merchant's own delivery fee in naira (used only for MERCHANT_DELIVERY orders). */
  @Column({ type: 'int', default: 0 })
  deliveryFee: number;

  @Column({ type: 'int', default: 0 })
  ratingSum: number;

  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
