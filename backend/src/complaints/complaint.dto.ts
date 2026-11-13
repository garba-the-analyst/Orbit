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

export class CreateComplaintDto {
  @ApiProperty({ example: 'DELIVERY' })
  @IsEnum(['ORDER', 'DELIVERY', 'RIDER', 'MERCHANT', 'PAYMENT', 'APP', 'OTHER'])
  category: 'ORDER' | 'DELIVERY' | 'RIDER' | 'MERCHANT' | 'PAYMENT' | 'APP' | 'OTHER';

  @ApiProperty({ example: 'Rider never arrived' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'The rider marked delivered but I never received my order.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;
}

export class ComplaintResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  adminResponse: string | null;

  @ApiPropertyOptional()
  handledById: string | null;

  @ApiPropertyOptional()
  resolvedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UpdateComplaintDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] })
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'We have refunded your order.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminResponse?: string;
}

export class ComplaintQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] })
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'])
  status?: string;

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
