import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { VEHICLE_SPECS } from '../common/catalog';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role, VEHICLES, VehicleType } from '../common/enums';
import { marketAt } from '../common/markets';
import { config } from '../config/config';
import { GeoService } from './geo.service';
import { LocationService } from './location.service';
import { SavedPlace } from './place.entity';

const limit = (n: number) => ({ default: { limit: config.isTest ? 100_000 : n, ttl: 60_000 } });
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class RouteQuery {
  @Type(() => Number) @IsLatitude() fromLat: number;
  @Type(() => Number) @IsLongitude() fromLng: number;
  @Type(() => Number) @IsLatitude() toLat: number;
  @Type(() => Number) @IsLongitude() toLng: number;
  @IsOptional() @IsIn(VEHICLES) vehicle?: string;
}
class SearchQuery {
  @IsString() @Length(3, 120) q: string;
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}
class ReverseQuery {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
}
class PlaceDto {
  @Transform(trim) @IsString() @Length(1, 30) label: string;
  @Transform(trim) @IsString() @Length(3, 240) address: string;
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
}
class LocationDto {
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsOptional() @IsInt() @Min(0) @Max(359) heading?: number;
}

const assertServed = (...points: Array<{ lat: number; lng: number }>) => {
  for (const p of points) {
    if (!marketAt(p, config.markets.enabled)) throw new BadRequestException('That point is outside the countries ORBIT serves.');
  }
};

@ApiTags('maps')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Throttle(limit(60))
  @ApiOperation({ summary: 'Road route, distance, time and turn-by-turn steps between two points (OpenStreetMap data via OSRM). Falls back to an estimate if routing is down.' })
  @Get('route')
  route(@Query() q: RouteQuery) {
    const from = { lat: q.fromLat, lng: q.fromLng };
    const to = { lat: q.toLat, lng: q.toLng };
    assertServed(from, to);
    return this.geo.route(from, to, (q.vehicle ?? 'CAR') as VehicleType);
  }

  @Throttle(limit(30))
  @ApiOperation({ summary: 'Find a place or address (OpenStreetMap Nominatim). Optionally bias results near lat/lng.' })
  @Get('search')
  async search(@Query() q: SearchQuery) {
    const near = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return { online: this.geo.online, results: await this.geo.search(q.q, near) };
  }

  @Throttle(limit(30))
  @ApiOperation({ summary: 'The address at a map point' })
  @Get('reverse')
  async reverse(@Query() q: ReverseQuery) {
    assertServed(q);
    return { address: await this.geo.reverse(q) };
  }
}

@ApiTags('maps')
@ApiBearerAuth()
@Controller('places')
export class PlacesController {
  constructor(@InjectRepository(SavedPlace) private readonly places: Repository<SavedPlace>) {}

  @ApiOperation({ summary: 'Your saved places (Home, Work, ...)' })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.places.find({ where: { userId: user.id }, order: { createdAt: 'ASC' }, select: { id: true, label: true, address: true, lat: true, lng: true } });
  }

  @ApiOperation({ summary: 'Save a place. Saving the same label again replaces it.' })
  @Post()
  async save(@CurrentUser() user: AuthUser, @Body() dto: PlaceDto) {
    assertServed(dto);
    const existing = await this.places.findOne({ where: { userId: user.id, label: dto.label } });
    if (!existing && (await this.places.count({ where: { userId: user.id } })) >= 20) {
      throw new BadRequestException('You can save up to 20 places. Remove one first.');
    }
    const row = await this.places.save(this.places.create({ ...(existing ?? {}), userId: user.id, ...dto }));
    return { id: row.id, label: row.label, address: row.address, lat: row.lat, lng: row.lng };
  }

  @HttpCode(200)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.places.delete({ id, userId: user.id });
    return { ok: true };
  }
}

@ApiTags('rider')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider/location')
export class RiderLocationController {
  constructor(private readonly location: LocationService) {}

  @Throttle(limit(60))
  @HttpCode(200)
  @ApiOperation({ summary: 'Driver app: report your position every few seconds while online' })
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.location.update(user.id, dto);
  }
}
