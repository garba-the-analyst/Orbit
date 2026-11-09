import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DATETIME, UUID_TYPE } from '../database/column-types';

/**
 * A ride, parcel delivery or freight job from one point to another, booked on demand.
 * All money is whole units of `currency`; the fare is fixed when the trip is requested.
 */
@Entity('trips')
@Index(['status', 'waveExpiresAt'])
// The database itself guarantees one active trip per customer and one active trip per driver, even if two
// requests race: the second insert or update fails and the service turns that into a clear 409.
@Index('uq_trip_one_active_per_customer', ['customerId'], {
  unique: true,
  where: `"status" IN ('SEARCHING','ACCEPTED','ARRIVED','IN_PROGRESS')`,
})
@Index('uq_trip_one_active_per_driver', ['driverId'], {
  unique: true,
  where: `"driverId" IS NOT NULL AND "status" IN ('ACCEPTED','ARRIVED','IN_PROGRESS')`,
})
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short reference shown to people, like TRP-261109-K7QX. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 8 })
  kind: string;

  @Index()
  @Column({ type: 'varchar', length: 12 })
  status: string;

  @Index()
  @Column({ type: UUID_TYPE })
  customerId: string;

  @Index()
  @Column({ type: UUID_TYPE, nullable: true })
  driverId: string | null;

  @Column({ type: 'varchar', length: 20 })
  vehicleType: string;

  @Column({ type: 'varchar', length: 2, default: 'NG' })
  country: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  // ---- Route ----------------------------------------------------------------------------------
  @Column({ type: 'varchar', length: 240 }) pickupAddress: string;
  @Column({ type: 'float' }) pickupLat: number;
  @Column({ type: 'float' }) pickupLng: number;
  @Column({ type: 'varchar', length: 240 }) dropAddress: string;
  @Column({ type: 'float' }) dropLat: number;
  @Column({ type: 'float' }) dropLng: number;
  @Column({ type: 'int' }) distanceM: number;
  @Column({ type: 'int' }) durationS: number;
  /** The planned route, thinned for display: [lat, lng] pairs. */
  @Column({ type: 'simple-json', default: '[]' }) geometry: Array<[number, number]>;

  // ---- Money (fixed at request) ---------------------------------------------------------------
  @Column({ type: 'int' }) baseFare: number;
  @Column({ type: 'int' }) distanceFare: number;
  @Column({ type: 'int' }) timeFare: number;
  @Column({ type: 'float', default: 1 }) surge: number;
  /** The fare before any promotion. Commission and the driver's earning are worked out from this. */
  @Column({ type: 'int' }) fullFare: number;
  @Column({ type: 'varchar', length: 24, nullable: true }) promoCode: string | null;
  @Column({ type: 'int', default: 0 }) discount: number;
  /** What the customer pays: fullFare less discount. */
  @Column({ type: 'int' }) fare: number;
  @Column({ type: 'int' }) commission: number;
  @Column({ type: 'int' }) driverEarning: number;
  @Column({ type: 'varchar', length: 6 }) paymentMethod: string;
  @Column({ type: 'boolean', default: false }) paid: boolean;
  @Column({ type: 'int', default: 0 }) tip: number;
  @Column({ type: 'int', default: 0 }) cancelFee: number;

  // ---- What is being carried ------------------------------------------------------------------
  @Column({ type: 'int', default: 1 }) passengers: number;
  @Column({ type: 'varchar', length: 12, nullable: true }) goodsType: string | null;
  @Column({ type: 'float', nullable: true }) weightKg: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) notes: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) recipientName: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) recipientPhone: string | null;

  // ---- Matching -------------------------------------------------------------------------------
  /** How many waves of offers have gone out. */
  @Column({ type: 'int', default: 0 }) wave: number;
  @Column({ type: DATETIME, nullable: true }) waveExpiresAt: Date | null;
  /** Times a driver dropped the trip after accepting, and it went back to searching. */
  @Column({ type: 'int', default: 0 }) redispatches: number;
  @Column({ type: 'int', default: 0 }) pinAttempts: number;
  /** The vehicle the driver was using when they accepted, kept as it was even if they later change vehicles. */
  @Column({ type: 'simple-json', nullable: true })
  vehicleInfo: { type: string; label: string; make: string; model: string; color: string; plate: string } | null;

  // ---- Timeline -------------------------------------------------------------------------------
  @CreateDateColumn() requestedAt: Date;
  @Column({ type: DATETIME, nullable: true }) acceptedAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) arrivedAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) startedAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) completedAt: Date | null;
  @Column({ type: DATETIME, nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'varchar', length: 10, nullable: true }) cancelledBy: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) cancelReason: string | null;
  /** The customer cancelled after the free window (or after the driver arrived). Counts towards the abuse limit. */
  @Column({ type: 'boolean', default: false }) lateCancel: boolean;

  // ---- After the trip -------------------------------------------------------------------------
  @Column({ type: 'int', nullable: true }) driverRating: number | null;
  @Column({ type: 'int', nullable: true }) customerRating: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) ratingComment: string | null;

  /** Random token for the "share my trip" link. Null until the customer shares. */
  @Index()
  @Column({ type: 'varchar', length: 40, nullable: true })
  shareToken: string | null;
}

/** One offer of one trip to one driver. A driver is offered a given trip at most once. */
@Entity('trip_offers')
@Unique(['tripId', 'driverId'])
export class TripOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: UUID_TYPE })
  tripId: string;

  @Index()
  @Column({ type: UUID_TYPE })
  driverId: string;

  @Column({ type: 'int' })
  wave: number;

  @Column({ type: 'varchar', length: 10, default: 'OFFERED' })
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

  @Column({ type: DATETIME })
  expiresAt: Date;

  /** Straight-line distance from the driver to the pickup when the offer was made. */
  @Column({ type: 'int' })
  distanceM: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  code: string;

  @Column({ type: 'varchar', length: 8 })
  type: 'PERCENT' | 'FLAT';

  /** A percentage (1 to 100) or an amount in whole currency units. */
  @Column({ type: 'int' })
  value: number;

  @Column({ type: 'int', nullable: true })
  maxDiscount: number | null;

  /** FLAT codes and caps are in this currency; the code applies only to trips in it. */
  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: DATETIME, nullable: true })
  validUntil: Date | null;

  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

/** Each person may use a given code once. */
@Entity('promo_redemptions')
@Unique(['promoId', 'userId'])
export class PromoRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: UUID_TYPE })
  promoId: string;

  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  @Column({ type: UUID_TYPE })
  tripId: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** An emergency raised from inside a trip. Admins see it at once. */
@Entity('sos_alerts')
export class SosAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: UUID_TYPE, nullable: true })
  tripId: string | null;

  @Index()
  @Column({ type: UUID_TYPE })
  userId: string;

  /** Whether the person raising it was the customer or the driver. */
  @Column({ type: 'varchar', length: 10 })
  raisedBy: string;

  @Column({ type: 'float', nullable: true }) lat: number | null;
  @Column({ type: 'float', nullable: true }) lng: number | null;

  @Index()
  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status: 'OPEN' | 'RESOLVED';

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: DATETIME, nullable: true })
  resolvedAt: Date | null;
}
