import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

/** A place a person saved: Home, Work, a favourite spot. Used to start a ride or parcel quickly. */
@Entity('saved_places')
export class SavedPlace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  @Column({ type: 'varchar', length: 30 })
  label: string;

  @Column({ type: 'varchar', length: 240 })
  address: string;

  @Column({ type: 'float' })
  lat: number;

  @Column({ type: 'float' })
  lng: number;

  @CreateDateColumn()
  createdAt: Date;
}
