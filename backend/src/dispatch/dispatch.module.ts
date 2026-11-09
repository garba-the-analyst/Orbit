import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { User } from '../users/user.entity';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), OrdersModule, VehiclesModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
