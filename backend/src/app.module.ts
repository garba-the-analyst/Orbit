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
import { Order, OrderItem } from './orders/order.entity';
import { OrdersModule } from './orders/orders.module';
import { Payment } from './payments/payment.entity';
import { PaymentsModule } from './payments/payments.module';
import { Product } from './products/product.entity';
import { RealtimeModule } from './realtime/realtime.module';
import { SeedService } from './seed/seed.service';
import { Shop } from './shops/shop.entity';
import { ShopsModule } from './shops/shops.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

const entities = [User, Shop, Product, Order, OrderItem, Payment, LedgerEntry];

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
    TypeOrmModule.forFeature([User, Shop, Product]),
    JwtModule.register({
      global: true,
      secret: config.jwt.secret,
      signOptions: { expiresIn: config.jwt.expiresIn as never },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.rateLimit.global }]),
    RealtimeModule,
    UsersModule,
    AuthModule,
    ShopsModule,
    OrdersModule,
    PaymentsModule,
    DispatchModule,
    EarningsModule,
    AdminModule,
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
