import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';
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

  /** ISO country code of the market this person uses ORBIT in. */
  @Column({ type: 'varchar', length: 2, default: 'NG' })
  country: string;

  /** Profile picture URL (served from /uploads). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  avatarUrl: string | null;

  /** The one account that can create and manage other admins. Set only by the startup bootstrap. */
  @Column({ type: 'boolean', default: false })
  isSuperAdmin: boolean;

  /** Which admin created this account (set for admins created by the superadmin). */
  @Column({ type: UUID_TYPE, nullable: true })
  createdById: string | null;

  /** A temporary password was set for this person: they must choose their own before doing anything else. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  /** Tokens issued before this moment are rejected, so changing a password signs out other devices. */
  @Column({ type: DATETIME, nullable: true })
  passwordChangedAt: Date | null;

  // ---- Driver-only fields -------------------------------------------------------------------------
  /** LIGHT (bike, rickshaw, car) or HEAVY (pickup, truck, lorry, long-haul). Null for non-drivers. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  fleet: string | null;

  /** The type of the driver's main vehicle (details live in the vehicles table). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicle: string | null;

  /** Last known position, sent by the driver's app while online. Used for matching and live tracking. */
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @Column({ type: 'int', nullable: true })
  heading: number | null;

  @Column({ type: DATETIME, nullable: true })
  locationAt: Date | null;

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
