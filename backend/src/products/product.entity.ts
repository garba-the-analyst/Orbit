import { UUID_TYPE } from '../database/column-types';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Shop } from '../shops/shop.entity';

/** A catalogue item. Price is whole naira; stock is decremented when an order is created. */
@Entity('products')
@Index(['shopId', 'available'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 400, default: '' })
  description: string;

  /** GOOD (a thing, with stock) or SERVICE (work the shop does, no stock). */
  @Column({ type: 'varchar', length: 10, default: 'GOOD' })
  kind: string;

  /** What sort of goods this is, so riders and customers can see how to handle it. */
  @Column({ type: 'varchar', length: 12, default: 'GENERAL' })
  goodsType: string;

  /** Up to 8 picture URLs, the first being the cover. All come from this merchant's uploads. */
  @Column({ type: 'simple-json', default: '[]' })
  images: string[];

  /** Size of the item as packed, in centimetres, and its weight in kilograms. Used to pick a suitable vehicle. */
  @Column({ type: 'int', nullable: true })
  lengthCm: number | null;

  @Column({ type: 'int', nullable: true })
  widthCm: number | null;

  @Column({ type: 'int', nullable: true })
  heightCm: number | null;

  @Column({ type: 'float', nullable: true })
  weightKg: number | null;

  /** What the price is for, like "per kg", "per hour" or "each". */
  @Column({ type: 'varchar', length: 30, nullable: true })
  unitLabel: string | null;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  /** Merchants can hide an item without deleting it. */
  @Column({ type: 'boolean', default: true })
  available: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
