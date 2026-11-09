import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

/** A shop a person has saved. One row per person and shop. */
@Entity('favourites')
@Unique(['userId', 'shopId'])
export class Favourite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  @Column({ type: UUID_TYPE })
  shopId: string;

  @CreateDateColumn()
  createdAt: Date;
}
