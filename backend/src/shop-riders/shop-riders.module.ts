import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { ShopRider } from './shop-rider.entity';
import { MerchantRidersController, RiderShopsController } from './shop-riders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShopRider, Shop, User])],
  controllers: [MerchantRidersController, RiderShopsController],
})
export class ShopRidersModule {}
