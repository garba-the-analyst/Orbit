import { UUID_TYPE } from '../database/column-types';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Shop } from '../shops/shop.entity';

/** A catalogue item. Price is whole naira; stock is decremented when an order is created. */
@Entity('products')
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
