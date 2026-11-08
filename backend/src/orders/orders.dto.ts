import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
import { NG_PHONE } from '../auth/auth.dto';
import { Fulfilment } from '../common/enums';

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

  @ApiPropertyOptional({ description: 'Required unless picking up' })
  @ValidateIf((o: CreateOrderDto) => o.fulfilment !== Fulfilment.PICKUP)
  @Transform(trim)
  @IsString()
  @Length(5, 240, { message: 'Enter where we should deliver (hostel, room or landmark).' })
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(240)
  deliveryNote?: string;

  @ApiPropertyOptional({ description: 'Defaults to your account phone' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(NG_PHONE, { message: 'Enter a valid Nigerian phone number, like 08031234567.' })
  contactPhone?: string;
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
