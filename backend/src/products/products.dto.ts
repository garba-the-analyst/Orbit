import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GOODS_TYPES } from '../common/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @ApiProperty({ example: 'Jollof rice and chicken' })
  @Transform(trim) @IsString() @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ description: 'Full description: what it is, what is included, materials, care.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Price in whole units of the shop currency (whole naira for Nigeria)', example: 2800 })
  @IsInt() @Min(1) @Max(50_000_000)
  price: number;

  @ApiPropertyOptional({ description: 'Units in stock. Ignored for services.', example: 20 })
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  stock?: number;

  @ApiPropertyOptional({ enum: ['GOOD', 'SERVICE'], default: 'GOOD' })
  @IsOptional() @IsIn(['GOOD', 'SERVICE'])
  kind?: 'GOOD' | 'SERVICE';

  @ApiPropertyOptional({ enum: GOODS_TYPES, default: 'GENERAL' })
  @IsOptional() @IsIn(GOODS_TYPES)
  goodsType?: string;

  @ApiPropertyOptional({ description: 'Picture URLs from POST /uploads, the first is the cover. At most 8.', type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(300, { each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Length in cm' })
  @IsOptional() @IsInt() @Min(1) @Max(5000)
  lengthCm?: number | null;

  @ApiPropertyOptional({ description: 'Width in cm' })
  @IsOptional() @IsInt() @Min(1) @Max(5000)
  widthCm?: number | null;

  @ApiPropertyOptional({ description: 'Height in cm' })
  @IsOptional() @IsInt() @Min(1) @Max(5000)
  heightCm?: number | null;

  @ApiPropertyOptional({ description: 'Weight in kg' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(50_000)
  weightKg?: number | null;

  @ApiPropertyOptional({ description: 'What the price covers, like "per kg" or "per hour"', example: 'each' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  unitLabel?: string | null;

  @ApiPropertyOptional({ description: 'Hide an item without deleting it' })
  @IsOptional() @IsBoolean()
  available?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
