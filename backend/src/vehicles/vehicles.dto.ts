import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { VEHICLES } from '../common/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PLATE = /^[A-Za-z0-9][A-Za-z0-9 -]{3,14}[A-Za-z0-9]$/;

export class CreateVehicleDto {
  @ApiProperty({ enum: VEHICLES })
  @IsIn(VEHICLES)
  type: string;

  @ApiPropertyOptional({ description: 'Required for everything except bicycles', example: 'ABC-123XY' })
  @ValidateIf((o: CreateVehicleDto) => o.type !== 'BICYCLE')
  @Transform(trim)
  @IsString()
  @Matches(PLATE, { message: 'Enter the registration plate as it appears on the vehicle.' })
  plate?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(40) make?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60) model?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30) color?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1980) @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Kilograms it can carry. Defaults to the type’s limit; cannot exceed it.' })
  @IsOptional() @IsInt() @Min(1) @Max(60_000)
  capacityKg?: number;

  @ApiPropertyOptional({ type: [String], description: 'Picture URLs from POST /uploads?kind=vehicle (at most 4)' })
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(300, { each: true })
  photos?: string[];
}

export class UpdateVehicleDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PLATE, { message: 'Enter the registration plate as it appears on the vehicle.' }) plate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(40) make?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60) model?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60_000) capacityKg?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(300, { each: true }) photos?: string[];
}

export class RejectVehicleDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 200) note: string;
}
