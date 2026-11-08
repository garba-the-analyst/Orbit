import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @ApiProperty({ example: 'Jollof rice and chicken' })
  @Transform(trim) @IsString() @Length(2, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(400)
  description?: string;

  @ApiProperty({ description: 'Price in whole naira', example: 2800 })
  @IsInt() @Min(1) @Max(5_000_000)
  price: number;

  @ApiProperty({ description: 'Units in stock', example: 20 })
  @IsInt() @Min(0) @Max(100_000)
  stock: number;

  @ApiPropertyOptional({ description: 'Hide an item without deleting it' })
  @IsOptional() @IsBoolean()
  available?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 100)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(400)
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5_000_000)
  price?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000)
  stock?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  available?: boolean;
}
