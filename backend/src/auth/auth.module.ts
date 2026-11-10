import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { PasswordReset } from './password-reset.entity';
import { PasswordResetService } from './password-reset.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, PasswordReset]), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService],
})
export class AuthModule {}
