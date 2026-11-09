import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { ShopRider } from '../shop-riders/shop-rider.entity';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { MerchantOrdersController, OrdersController } from './orders.controller';
import { Order, OrderItem } from './order.entity';
import { OrdersService } from './orders.service';

@Module({
  imports: [VehiclesModule, TypeOrmModule.forFeature([Order, OrderItem, Shop, Product, Payment, User, LedgerEntry, ShopRider])],
  controllers: [OrdersController, MerchantOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
