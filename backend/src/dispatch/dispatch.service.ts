/**
 * Dispatch: the rider's job board, active jobs and availability (proposal section 4.2).
 *
 * MVP dispatch is a pull model: confirmed courier orders appear on a shared board and an online,
 * verified rider taps Accept. Automatic matching by distance (PostGIS) is a later phase.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../common/auth.decorators';
import { fleetOfOrNull } from '../common/catalog';
import { Fulfilment, OrderStatus, Role } from '../common/enums';
import { Order } from '../orders/order.entity';
import { OrderView, toOrderView } from '../orders/order.view';
import { User } from '../users/user.entity';
import { VehiclesService } from '../vehicles/vehicles.service';

const WITH_RELATIONS = { shop: true, customer: true, courier: true } as const;

@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly vehicles: VehiclesService,
  ) {}

  async setOnline(rider: AuthUser, online: boolean): Promise<{ online: boolean }> {
    if (online && !(await this.vehicles.hasApprovedActive(rider.id))) {
      throw new ConflictException('Your vehicle has not been approved yet. Add its details and wait for ORBIT to review it.');
    }
    await this.users.update({ id: rider.id }, { online });
    return { online };
  }

  /** Unclaimed courier jobs, oldest first. Personal details are withheld until a rider accepts. */
  async board(rider: AuthUser): Promise<OrderView[]> {
    const me = await this.users.findOne({ where: { id: rider.id }, select: { vehicle: true } });
    if (fleetOfOrNull(me?.vehicle) === 'HEAVY') return []; // heavy-goods vehicles take logistics requests only
    const rows = await this.orders.find({
      where: {
        fulfilment: Fulfilment.ORBIT_COURIER,
        courierId: IsNull(),
        status: In([OrderStatus.CONFIRMED, OrderStatus.READY]),
      },
      relations: WITH_RELATIONS,
      order: { createdAt: 'ASC' },
      take: 30,
    });
    return rows.map((o) => toOrderView(o, { id: rider.id, role: Role.RIDER }));
  }

  /** Jobs the rider has accepted and not yet finished. */
  async active(rider: AuthUser): Promise<OrderView[]> {
    const rows = await this.orders.find({
      where: {
        courierId: rider.id,
        status: In([OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY]),
      },
      relations: WITH_RELATIONS,
      order: { createdAt: 'ASC' },
    });
    return rows.map((o) => toOrderView(o, { id: rider.id, role: Role.RIDER }));
  }

  /** Completed deliveries, newest first. */
  async history(rider: AuthUser): Promise<OrderView[]> {
    const rows = await this.orders.find({
      where: { courierId: rider.id, status: OrderStatus.DELIVERED },
      relations: WITH_RELATIONS,
      order: { deliveredAt: 'DESC' },
      take: 50,
    });
    return rows.map((o) => toOrderView(o, { id: rider.id, role: Role.RIDER }));
  }
}
