import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shops/shop.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Shop]), UploadsModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
