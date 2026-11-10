import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';

/** A pending "forgot password" request. Only the hash of the emailed token is kept. */
@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: DATETIME })
  expiresAt: Date;

  @Column({ type: DATETIME, nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
