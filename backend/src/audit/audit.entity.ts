import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

/** An append-only record of what ORBIT staff did: who, what, to which record, and when. */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn()
  at: Date;

  @Index()
  @Column({ type: UUID_TYPE })
  actorId: string;

  /** The route that was called, for example "POST /admin/users/:id/approve". */
  @Column({ type: 'varchar', length: 120 })
  action: string;

  /** The first id in the route, normally the record that was changed. */
  @Index()
  @Column({ type: 'varchar', length: 40, nullable: true })
  targetId: string | null;

  /** Only a short allow-list of fields from the request (never passwords or documents). */
  @Column({ type: 'simple-json', default: '{}' })
  details: Record<string, string | number | boolean>;
}
