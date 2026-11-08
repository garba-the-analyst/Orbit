import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Your own delivery fee in naira' }) @IsOptional() @IsInt() @Min(0) @Max(10_000)
  deliveryFee?: number;
}
