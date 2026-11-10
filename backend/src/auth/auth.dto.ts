import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SHOP_CATEGORIES } from '../common/catalog';
import { Role, VEHICLES } from '../common/enums';
import { IsAppPhone, toE164 } from '../common/phone';

/** Nigerian mobile numbers: 0803..., 0703..., +234803... (spaces and dashes are stripped first). */
export const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;
const stripPhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export { SHOP_CATEGORIES };

export class ForgotPasswordDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() @MaxLength(254) email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link.' }) @IsString() @Length(20, 100) token: string;

  @ApiProperty({ minLength: 8, description: 'At least 8 characters with a letter and a number.' })
  @IsString() @MinLength(8) @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password needs at least one letter and one number.' })
  password: string;
}

export class RegisterDto {
  @ApiPropertyOptional({ description: 'The person agreed to the terms and privacy notice (GET /legal). Required in production.' })
  @IsOptional() @IsBoolean() acceptTerms?: boolean;

  @ApiProperty({ example: 'Amina Yusuf' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ example: 'amina@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '08031234567' })
  @Transform(toE164)
  @IsAppPhone()
  phone: string;

  @ApiProperty({ minLength: 8, description: 'At least 8 characters with a letter and a number.' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password needs at least one letter and one number.' })
  password: string;

  @ApiProperty({ enum: [Role.CUSTOMER, Role.MERCHANT, Role.RIDER] })
  @IsIn([Role.CUSTOMER, Role.MERCHANT, Role.RIDER], { message: 'Choose customer, merchant or rider.' })
  role: Role;

  // ---- Merchant-only --------------------------------------------------------------------------
  @ApiPropertyOptional({ description: 'Required for merchants.' })
  @ValidateIf((o: RegisterDto) => o.role === Role.MERCHANT)
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  shopName?: string;

  @ApiPropertyOptional({ enum: SHOP_CATEGORIES, description: 'Required for merchants.' })
  @ValidateIf((o: RegisterDto) => o.role === Role.MERCHANT)
  @IsIn(SHOP_CATEGORIES)
  shopCategory?: string;

  @ApiPropertyOptional({ description: 'Required for merchants.' })
  @ValidateIf((o: RegisterDto) => o.role === Role.MERCHANT)
  @Transform(trim)
  @IsString()
  @Length(5, 200)
  shopAddress?: string;

  // ---- Rider-only -----------------------------------------------------------------------------
  @ApiPropertyOptional({ enum: VEHICLES, description: 'Required for riders.' })
  @ValidateIf((o: RegisterDto) => o.role === Role.RIDER)
  @IsIn(VEHICLES)
  vehicle?: string;

  @ApiPropertyOptional({ description: 'Registration plate (not needed for bicycles). Can be added later.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  plate?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  vehicleModel?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  vehicleColor?: string;
}

export class LoginDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(72)
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toE164)
  @IsAppPhone()
  phone?: string;

  @ApiPropertyOptional({ nullable: true, description: 'URL returned by POST /uploads?kind=avatar. Send null to remove it.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  avatarUrl?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ minLength: 8, description: 'At least 8 characters with a letter and a number.' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password needs at least one letter and one number.' })
  newPassword: string;
}
