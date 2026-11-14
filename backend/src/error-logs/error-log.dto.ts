import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ClientErrorDto {
  @ApiProperty({ example: '/c/basket' })
  @IsString()
  @MinLength(1)
  path: string;

  @ApiProperty({ example: 'GET' })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  method: string;

  @ApiProperty({ example: 'Cannot read property of null' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  stack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;
}

export class ErrorLogView {
  id: string;
  createdAt: Date;
  path: string;
  method: string;
  message: string;
  stack: string | null;
  userId: string | null;
  role: string | null;
  userAgent: string | null;
  reviewed: boolean;
}

export class ErrorLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  limit?: number;
}

export class MarkReviewedDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reviewed: boolean;
}
