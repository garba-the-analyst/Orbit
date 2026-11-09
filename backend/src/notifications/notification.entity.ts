import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';

/** An in-app notification. Persisted so it survives offline periods; the socket only signals that a new one exists. */
@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: UUID_TYPE })
  userId: string;

  /** Machine-readable kind, e.g. order.placed, trip.accepted. The app picks an icon from it. */
  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 300 })
  body: string;

  /** Where tapping it goes: { orderId } or { tripId }. */
  @Column({ type: 'simple-json', default: '{}' })
  data: Record<string, string>;

  @Column({ type: DATETIME, nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
