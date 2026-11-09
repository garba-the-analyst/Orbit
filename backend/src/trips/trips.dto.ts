import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { GOODS_SPECS, VEHICLE_SPECS } from '../common/catalog';
import { PaymentMethod, TripKind } from '../common/enums';
import { IsAppPhone, toE164 } from '../common/phone';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const VEHICLES = Object.keys(VEHICLE_SPECS);
const GOODS = Object.keys(GOODS_SPECS);

export class PointDto {
  @ApiProperty({ example: 6.5244 }) @IsLatitude() lat: number;
  @ApiProperty({ example: 3.3792 }) @IsLongitude() lng: number;
  @ApiProperty({ example: 'Yaba Tech, Herbert Macaulay Way, Lagos' })
  @Transform(trim) @IsString() @Length(2, 240)
  address: string;
}

export class QuoteTripDto {
  @ApiProperty({ enum: TripKind, description: 'RIDE carries people; PARCEL carries goods, from an envelope to a lorry load.' })
  @IsEnum(TripKind) kind: TripKind;

  @ApiProperty({ type: PointDto }) @ValidateNested() @Type(() => PointDto) pickup: PointDto;
  @ApiProperty({ type: PointDto }) @ValidateNested() @Type(() => PointDto) drop: PointDto;

  @ApiPropertyOptional({ description: 'Rides: how many people (default 1).' })
  @IsOptional() @IsInt() @Min(1) @Max(8) passengers?: number;

  @ApiPropertyOptional({ enum: GOODS, description: 'Parcels: what is being carried.' })
  @IsOptional() @IsIn(GOODS) goodsType?: string;

  @ApiPropertyOptional({ description: 'Parcels: total weight in kilograms (required for parcels).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0.1) @Max(40000) weightKg?: number;
}

export class CreateTripDto extends QuoteTripDto {
  @ApiProperty({ enum: VEHICLES }) @IsIn(VEHICLES) vehicleType: string;

  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'The surge multiplier shown to the customer. If demand has pushed the price higher since, the request is refused with the new price (409 PRICE_CHANGED).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(5) acceptedSurge?: number;

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString() @Matches(/^[A-Z0-9_-]{3,24}$/, { message: 'That promo code does not look right.' }) promoCode?: string;

  @ApiPropertyOptional({ description: 'Parcels: who receives the goods.' })
  @ValidateIf((o: CreateTripDto) => o.kind === TripKind.PARCEL) @Transform(trim) @IsString() @Length(2, 80) recipientName?: string;

  @ApiPropertyOptional() @ValidateIf((o: CreateTripDto) => o.kind === TripKind.PARCEL) @Transform(toE164) @IsAppPhone() recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Note for the driver (gate code, landmark, handling).' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) notes?: string;
}

export class CancelTripDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120) reason?: string;
}

export class RateTripDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) comment?: string;
}

export class TipTripDto {
  @ApiProperty({ description: 'Whole currency units. Card trips only.' }) @IsInt() @Min(1) @Max(100_000) amount: number;
}

export class PinDto {
  @ApiPropertyOptional({ description: 'The 4-digit PIN the customer (rides) or recipient (parcels) reads out.' })
  @IsOptional() @IsString() @Matches(/^\d{4}$/, { message: 'The PIN is four digits.' }) pin?: string;
}

export class SosDto {
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) note?: string;
}

export class CheckPromoDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsString() @Matches(/^[A-Z0-9_-]{3,24}$/) code: string;
  @ApiPropertyOptional({ description: 'Currency of the trip (default: the first enabled market).' }) @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class CreatePromoDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsString() @Matches(/^[A-Z0-9_-]{3,24}$/, { message: 'Use 3 to 24 letters, digits, dashes or underscores.' }) code: string;
  @ApiProperty({ enum: ['PERCENT', 'FLAT'] }) @IsIn(['PERCENT', 'FLAT']) type: 'PERCENT' | 'FLAT';
  @ApiProperty({ description: 'A percentage (1 to 100) or a flat amount in whole currency units.' }) @IsInt() @Min(1) @Max(1_000_000) value: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @ApiPropertyOptional({ description: 'Days the code stays valid from now.' }) @IsOptional() @IsInt() @Min(1) @Max(730) validDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxUses?: number;
}

export class ResolveSosDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) note?: string;
}
