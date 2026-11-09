import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

export type ShopRiderStatus = 'INVITED' | 'ACTIVE';

/**
 * A shop's own riders. The shop invites an approved rider; the rider must accept before the shop can assign
 * deliveries to them. The shop pays its own riders directly: ORBIT's ledger records the shop's delivery fee as the
 * shop's, exactly as for any shop delivery.
 */
@Entity('shop_riders')
@Unique(['shopId', 'riderId'])
export class ShopRider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  shopId: string;

  @Index()
  @Column({ type: UUID_TYPE })
  riderId: string;

  @Column({ type: 'varchar', length: 10, default: 'INVITED' })
  status: ShopRiderStatus;

  @CreateDateColumn()
  createdAt: Date;
}
