import { UUID_TYPE } from '../database/column-types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerKind, LedgerParty } from '../common/enums';

/**
 * Settlement ledger. When an order is delivered, its total is split into lines for the merchant,
 * the rider (if any) and ORBIT. Lines are append-only, which keeps earnings auditable
 * (proposal section 13: "audit trails" and payout reconciliation).
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  orderId: string;

  @Column({ type: 'varchar', length: 12 })
  party: LedgerParty;

  /** The merchant or rider user id; null for the platform. */
  @Index()
  @Column({ type: UUID_TYPE, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 30 })
  kind: LedgerKind;

  /** Whole units of the order's currency, always positive. */
  @Column({ type: 'int' })
  amount: number;

  @Index()
  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;
}
