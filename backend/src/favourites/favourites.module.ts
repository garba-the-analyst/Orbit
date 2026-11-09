import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shops/shop.entity';
import { Favourite } from './favourite.entity';
import { FavouritesController } from './favourites.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Favourite, Shop])],
  controllers: [FavouritesController],
})
export class FavouritesModule {}
