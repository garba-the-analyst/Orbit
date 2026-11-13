import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UUID_TYPE, DATETIME } from '../database/column-types';

/** Customer complaint submitted through the app. Admins review and resolve these. */
@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Who filed the complaint. */
  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  /** What the complaint is about. */
  @Column({ type: 'varchar', length: 50 })
  category: 'ORDER' | 'DELIVERY' | 'RIDER' | 'MERCHANT' | 'PAYMENT' | 'APP' | 'OTHER';

  /** Short subject line. */
  @Column({ type: 'varchar', length: 200 })
  subject: string;

  /** Full complaint details. */
  @Column({ type: 'text' })
  message: string;

  /** Current status of the complaint. */
  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

  /** Admin response (filled when resolved/rejected). */
  @Column({ type: 'text', nullable: true })
  adminResponse: string | null;

  /** Which admin handled it. */
  @Column({ type: UUID_TYPE, nullable: true })
  handledById: string | null;

  @Column({ type: DATETIME, nullable: true })
  resolvedAt: Date | null;
}
