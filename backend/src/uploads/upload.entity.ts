import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

/** Metadata for an image a user uploaded. Lets us check that an image URL used in a profile or product really is theirs. */
@Entity('uploads')
export class Upload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  ownerId: string;

  /** The URL the app uses (relative like /uploads/p/abc.webp, or absolute if PUBLIC_BASE_URL is set). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  url: string;

  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'int' })
  bytes: number;

  @CreateDateColumn()
  createdAt: Date;
}
