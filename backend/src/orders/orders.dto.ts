import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsLatitude,
  IsLongitude,
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsAppPhone, toE164 } from '../common/phone';
import { Fulfilment } from '../common/enums';

const needsAddress = (o: CreateOrderDto) =>
  o.fulfilment === Fulfilment.MERCHANT_DELIVERY || o.fulfilment === Fulfilment.ORBIT_COURIER;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OrderLineDto {
  @ApiProperty() @IsUUID() productId: string;

  @ApiProperty({ minimum: 1, maximum: 20 }) @IsInt() @Min(1) @Max(20) qty: number;
}

export class CreateOrderDto {
  @ApiProperty() @IsUUID() shopId: string;

  @ApiProperty({ type: [OrderLineDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  items: OrderLineDto[];

  @ApiProperty({ enum: Fulfilment, description: 'The delivery choice made at checkout' })
  @IsEnum(Fulfilment)
  fulfilment: Fulfilment;

  @ApiPropertyOptional({ description: 'Required when the order is delivered (by the shop or an ORBIT courier)' })
  @ValidateIf(needsAddress)
  @Transform(trim)
  @IsString()
  @Length(5, 240, { message: 'Enter where we should deliver (street, area or landmark).' })
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Drop-off pin on the map (send with deliveryLng)' })
  @IsOptional() @Type(() => Number) @IsLatitude()
  deliveryLat?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsLongitude()
  deliveryLng?: number;

  @ApiPropertyOptional({ description: 'CUSTOMER_RIDER: name of the rider you are sending to collect the order' })
  @ValidateIf((o: CreateOrderDto) => o.fulfilment === Fulfilment.CUSTOMER_RIDER)
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Enter the name of the person collecting.' })
  collectorName?: string;

  @ApiPropertyOptional({ description: 'CUSTOMER_RIDER: their phone number' })
  @IsOptional()
  @Transform(toE164)
  @IsAppPhone()
  collectorPhone?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(240)
  deliveryNote?: string;

  @ApiPropertyOptional({ description: 'Defaults to your account phone' })
  @IsOptional()
  @Transform(toE164)
  @IsAppPhone()
  contactPhone?: string;
}

export class DispatchOrderDto {
  @ApiPropertyOptional({ description: 'One of your own riders (see /merchant/riders). Leave out to deliver it yourself.' })
  @IsOptional() @IsUUID()
  riderId?: string;
}

export class AcceptOrderDto {
  @ApiPropertyOptional({ description: 'Minutes until ready. Defaults to your shop prep time.' })
  @IsOptional() @IsInt() @Min(1) @Max(180)
  prepMinutes?: number;
}

export class ReasonDto {
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  reason?: string;
}

export class PinDto {
  @ApiProperty({ example: '4821', description: 'The 4-digit delivery PIN shown to the customer' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'The PIN is 4 digits.' })
  pin: string;
}

export class RateOrderDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  comment?: string;
}
