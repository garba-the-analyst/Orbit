import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { Trip } from '../trips/trip.entities';
import { User } from '../users/user.entity';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { LedgerEntry } from './ledger-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntry, Order, Trip, User])],
  controllers: [EarningsController],
  providers: [EarningsService],
})
export class EarningsModule {}
