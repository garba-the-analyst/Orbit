import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME } from '../database/column-types';
import { AccountStatus, Role } from '../common/enums';

/** A person on the platform: customer, merchant, rider or admin. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** bcrypt hash. Never returned by the API. */
  @Column({ type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: Role;

  @Column({ type: 'varchar', length: 24, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  // ---- Rider-only fields -------------------------------------------------------------------------
  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicle: string | null;

  /** Whether the rider is currently accepting jobs. */
  @Column({ type: 'boolean', default: false })
  online: boolean;

  // ---- Brute-force protection --------------------------------------------------------------------
  @Column({ type: 'int', default: 0 })
  failedLogins: number;

  @Column({ type: DATETIME, nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
