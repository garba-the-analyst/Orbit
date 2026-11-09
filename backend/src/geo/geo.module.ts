import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GeoController, PlacesController, RiderLocationController } from './geo.controller';
import { GeoService } from './geo.service';
import { LocationService } from './location.service';
import { SavedPlace } from './place.entity';

/** Global: orders and trips both need routing and live location. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SavedPlace, User])],
  controllers: [GeoController, PlacesController, RiderLocationController],
  providers: [GeoService, LocationService],
  exports: [GeoService, LocationService],
})
export class GeoModule {}
