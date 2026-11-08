import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { User } from '../users/user.entity';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), OrdersModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
