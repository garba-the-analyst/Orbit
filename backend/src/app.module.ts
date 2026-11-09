/**
 * Root module. ORBIT's backend is a modular monolith (proposal section 9): one deployable, strict module
 * boundaries, so features can be split into services later only if scale requires it.
 *
 *   auth . users . shops(+products) . orders . payments . dispatch . earnings . admin . realtime
 */
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { config } from './config/config';
import { DispatchModule } from './dispatch/dispatch.module';
import { EarningsModule } from './earnings/earnings.module';
import { LedgerEntry } from './earnings/ledger-entry.entity';
import { AppController } from './health/app.controller';
import { Favourite } from './favourites/favourite.entity';
import { GeoModule } from './geo/geo.module';
import { SavedPlace } from './geo/place.entity';
import { FavouritesModule } from './favourites/favourites.module';
import { Notification } from './notifications/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { Order, OrderItem } from './orders/order.entity';
import { OrdersModule } from './orders/orders.module';
import { Payment } from './payments/payment.entity';
import { PaymentsModule } from './payments/payments.module';
import { Product } from './products/product.entity';
import { RealtimeModule } from './realtime/realtime.module';
import { SeedService } from './seed/seed.service';
import { ShopRider } from './shop-riders/shop-rider.entity';
import { ShopRidersModule } from './shop-riders/shop-riders.module';
import { Shop } from './shops/shop.entity';
import { ShopsModule } from './shops/shops.module';
import { Document } from './uploads/document.entity';
import { Upload } from './uploads/upload.entity';
import { UploadsModule } from './uploads/uploads.module';
import { User } from './users/user.entity';
import { PromoCode, PromoRedemption, SosAlert, Trip, TripOffer } from './trips/trip.entities';
import { TripsModule } from './trips/trips.module';
import { Vehicle } from './vehicles/vehicle.entity';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UsersModule } from './users/users.module';

const entities = [User, Shop, Product, Order, OrderItem, Payment, LedgerEntry, Upload, Document, Notification, Favourite, ShopRider, Vehicle, SavedPlace, Trip, TripOffer, PromoCode, PromoRedemption, SosAlert];

/**
 * Database connection. SQLite (zero setup) by default; PostgreSQL when DB_TYPE=postgres.
 * MVP note: `synchronize` creates/updates tables automatically. Before a production launch, switch to
 * TypeORM migrations (documented in docs/ARCHITECTURE.md).
 */
function databaseOptions() {
  if (config.db.type === 'postgres') {
    return {
      type: 'postgres' as const,
      url: config.db.url,
      entities,
      synchronize: process.env.DB_SYNC !== 'false',
      dropSchema: process.env.DB_DROP_SCHEMA === 'true', // tests only: start every test file from an empty database
      logging: process.env.DB_LOG === 'true' ? (['error'] as ['error']) : false,
    };
  }
  if (config.db.path !== ':memory:') mkdirSync(dirname(config.db.path), { recursive: true });
  return {
    type: 'better-sqlite3' as const,
    database: config.db.path,
    entities,
    synchronize: true,
    // Write-ahead logging gives concurrent readers while a write is in progress.
    prepareDatabase: (db: { pragma: (s: string) => unknown }) => {
      if (config.db.path !== ':memory:') db.pragma('journal_mode = WAL');
    },
  };
}

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions()),
    TypeOrmModule.forFeature([User, Shop, Product, Vehicle]),
    JwtModule.register({
      global: true,
      secret: config.jwt.secret,
      signOptions: { expiresIn: config.jwt.expiresIn as never },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.rateLimit.global }]),
    RealtimeModule,
    NotificationsModule,
    GeoModule,
    UsersModule,
    AuthModule,
    ShopsModule,
    OrdersModule,
    PaymentsModule,
    DispatchModule,
    EarningsModule,
    AdminModule,
    UploadsModule,
    FavouritesModule,
    ShopRidersModule,
    VehiclesModule,
    TripsModule,
  ],
  controllers: [AppController],
  providers: [
    SeedService,
    // Order matters: rate limit first, then authenticate, then authorise by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly seed: SeedService) {}

  async onApplicationBootstrap() {
    if (config.seedOnBoot) await this.seed.run();
  }
}
