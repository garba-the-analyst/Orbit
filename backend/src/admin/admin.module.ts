import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Order } from '../orders/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Shop, Product, Order, Payment, LedgerEntry]), OrdersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
