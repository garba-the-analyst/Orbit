import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UUID_TYPE } from '../database/column-types';

export const DOCUMENT_KINDS = ['ID_CARD', 'DRIVER_LICENCE', 'VEHICLE_PAPERS', 'BUSINESS_REG', 'OTHER'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A private verification document. The file itself sits in private storage; this row is its record. */
@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  ownerId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: DocumentKind;

  /** Key in private storage. Never sent to any client. */
  @Column({ type: 'varchar', length: 120 })
  storageKey: string;

  @Column({ type: 'varchar', length: 40 })
  mime: string;

  @Column({ type: 'int' })
  bytes: number;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: DocumentStatus;

  /** The reviewer's note, shown to the owner when a document is rejected. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
