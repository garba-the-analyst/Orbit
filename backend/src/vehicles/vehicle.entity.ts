import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

export type VehicleStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * A vehicle a driver or haulier has registered. One person may register several (a car and a bike, say) but only
 * one is active at a time; the active one is what jobs and trips are matched against.
 */
@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  ownerId: string;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  /** LIGHT or HEAVY, derived from the type. */
  @Index()
  @Column({ type: 'varchar', length: 10 })
  fleet: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  make: string;

  @Column({ type: 'varchar', length: 60, default: '' })
  model: string;

  @Column({ type: 'varchar', length: 30, default: '' })
  color: string;

  /** Registration plate, upper-case without spaces or dashes. Empty only for bicycles. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: '' })
  plate: string;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  /** How much it can carry, in kilograms. Defaults to the vehicle type's limit. */
  @Column({ type: 'int', nullable: true })
  capacityKg: number | null;

  /** Up to 4 pictures from POST /uploads?kind=vehicle. */
  @Column({ type: 'simple-json', default: '[]' })
  photos: string[];

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: VehicleStatus;

  /** The reviewer's note when a vehicle is rejected. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  reviewNote: string | null;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
