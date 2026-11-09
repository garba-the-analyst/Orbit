import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { IsAppPhone, toE164 } from '../common/phone';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const strong = /(?=.*[A-Za-z])(?=.*\d)/;

export class CreateAdminDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @Transform(toE164)
  @IsAppPhone()
  phone: string;

  @ApiProperty({ description: 'Temporary password. The admin must replace it at first sign-in.' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(strong, { message: 'Password needs at least one letter and one number.' })
  password: string;
}

export class ResetAdminPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(strong, { message: 'Password needs at least one letter and one number.' })
  temporaryPassword: string;
}
