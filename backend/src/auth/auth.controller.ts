import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowWhilePasswordChange, AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { config } from '../config/config';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: config.rateLimit.auth, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a customer, merchant or rider account' })
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: config.rateLimit.auth, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in and receive a bearer token' })
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user (also used to refresh status after admin approval)' })
  @AllowWhilePasswordChange()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.users.toPublic(await this.users.getOrFail(user.id));
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update your name or phone number' })
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @AllowWhilePasswordChange()
  @Throttle({ default: { limit: config.rateLimit.auth, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Change your password. Signs out your other devices and returns a new token.' })
  @Post('me/password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
