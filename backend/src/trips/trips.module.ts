import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { MatchingService } from './matching.service';
import { PromoCode, PromoRedemption, SosAlert, Trip, TripOffer } from './trip.entities';
import { TripEvents } from './trip.events';
import { TripsAdminService } from './trips-admin.service';
import { DriverTripsController, PublicTrackController, TripsAdminController, TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, TripOffer, PromoCode, PromoRedemption, SosAlert, User, Vehicle, Order, LedgerEntry])],
  controllers: [TripsController, PublicTrackController, DriverTripsController, TripsAdminController],
  providers: [TripsService, TripsAdminService, MatchingService, TripEvents],
  exports: [TripsAdminService, MatchingService],
})
export class TripsModule {}
