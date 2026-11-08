import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';
import { PaymentStatus } from '../common/enums';

/** One payment attempt for an order. The unique reference ties gateway callbacks back to the order. */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  orderId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  /** Amount in whole naira. A callback whose amount differs from this is rejected. */
  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 20, default: 'mock' })
  provider: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: DATETIME, nullable: true })
  paidAt: Date | null;
}
