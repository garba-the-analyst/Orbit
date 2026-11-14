import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

/** Client-side error captured from the web or mobile app and sent to the server.
 * Admins review these to find and fix bugs in production. */
@Entity('error_logs')
export class ErrorLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  /** Where the error happened (e.g. '/c/basket', '/a/complaints'). */
  @Column({ type: 'varchar', length: 200 })
  path: string;

  /** HTTP method if it was an API call, otherwise 'client'. */
  @Column({ type: 'varchar', length: 10 })
  method: string;

  /** Human-readable error message. */
  @Column({ type: 'text' })
  message: string;

  /** Full stack trace (may be long). */
  @Column({ type: 'text', nullable: true })
  stack: string | null;

  /** The user who hit the error, if signed in. */
  @Column({ type: UUID_TYPE, nullable: true })
  userId: string | null;

  /** The user's role at the time. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  role: string | null;

  /** Browser / platform info from the client. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  userAgent: string | null;

  /** Whether an admin has looked at this. */
  @Column({ type: 'boolean', default: false })
  reviewed: boolean;
}
