import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsAppPhone, toE164 } from '../common/phone';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Fields a merchant can change on their own shop. Status is controlled by admins only. */
export class UpdateShopDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(400)
  description?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(5, 200)
  address?: string;

  @ApiPropertyOptional({ description: 'Open or closed for new orders' }) @IsOptional() @IsBoolean()
  isOpen?: boolean;

  @ApiPropertyOptional({ description: 'Typical preparation time in minutes' }) @IsOptional() @IsInt() @Min(1) @Max(180)
  prepMinutes?: number;

  @ApiPropertyOptional({ description: 'Offer delivery with your own staff' }) @IsOptional() @IsBoolean()
  offersDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Your own delivery fee in whole units of your currency' }) @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  deliveryFee?: number;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  city?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({ description: 'Business phone number shown to customers' })
  @IsOptional() @Transform(toE164) @IsAppPhone()
  phone?: string;

  @ApiPropertyOptional({ example: 'Mon to Sat, 8am to 9pm' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  openingHours?: string;

  @ApiPropertyOptional({ description: 'Logo from POST /uploads?kind=logo. Send null to remove.' })
  @IsOptional() @IsString() @MaxLength(300)
  logoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Cover picture from POST /uploads?kind=cover. Send null to remove.' })
  @IsOptional() @IsString() @MaxLength(300)
  coverUrl?: string | null;

  @ApiPropertyOptional({ description: 'Shop location on the map (send lat and lng together)' })
  @IsOptional() @IsLatitude()
  lat?: number;

  @ApiPropertyOptional() @IsOptional() @IsLongitude()
  lng?: number;
}

/** Query string for browsing shops. */
export class ListShopsQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  q?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  category?: string;

  @ApiPropertyOptional({ description: 'Where the person is. With radiusKm, only shops that near are returned, nearest first.' })
  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(500)
  radiusKm?: number;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  city?: string;

  @ApiPropertyOptional({ description: 'ISO country code, like NG' }) @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value)) @IsString() @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Only shops that are open right now' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ enum: ['distance', 'rating', 'name'] }) @IsOptional() @IsIn(['distance', 'rating', 'name'])
  sort?: 'distance' | 'rating' | 'name';

  @ApiPropertyOptional({ default: 40 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}
