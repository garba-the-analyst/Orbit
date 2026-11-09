import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaymentMethod, TripKind } from '../common/enums';
import { NotificationsService, NewNotification } from '../notifications/notifications.service';
import { money } from '../orders/order.alerts';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/user.entity';
import { PromoCode, PromoRedemption, Trip } from './trip.entities';

export type TripEvent = 'accepted' | 'arrived' | 'started' | 'completed' | 'cancelled_by_customer' | 'cancelled_by_driver' | 'redispatched' | 'no_driver' | 'cancelled_by_admin';

const word = (t: Trip) => (t.kind === TripKind.RIDE ? 'ride' : 'delivery');
const first = (n?: string) => (n ?? 'Your driver').trim().split(/\s+/)[0];

/** Everything that must happen around a trip change besides the change itself: live signals, notifications, promo give-back. None of it may fail the change. */
@Injectable()
export class TripEvents {
  private readonly log = new Logger('TripEvents');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(PromoRedemption) private readonly redemptions: Repository<PromoRedemption>,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async changed(trip: Trip, event: TripEvent): Promise<void> {
    try {
      this.realtime.tripUpdated(trip, [trip.customerId, trip.driverId]);
      const ids = [trip.customerId, trip.driverId].filter((x): x is string => !!x);
      const names = new Map((await this.users.find({ where: { id: In(ids) }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      const driver = first(trip.driverId ? names.get(trip.driverId) : undefined);
      const data = { tripId: trip.id };
      const v = trip.vehicleInfo;
      const out: NewNotification[] = [];
      const to = (userId: string | null, type: string, title: string, body: string) => out.push({ userId, type, title, body, data });

      switch (event) {
        case 'accepted':
          to(trip.customerId, 'trip.accepted', 'Driver on the way', `${driver}${v ? ` (${v.color ? v.color + ' ' : ''}${v.label}, ${v.plate || 'no plate'})` : ''} accepted your ${word(trip)}.`);
          break;
        case 'arrived':
          to(trip.customerId, 'trip.arrived', trip.kind === TripKind.RIDE ? 'Your driver has arrived' : 'Your driver is at the pickup point', trip.kind === TripKind.RIDE ? `Meet ${driver} and read out your start PIN.` : `${driver} is collecting the goods.`);
          break;
        case 'started':
          to(trip.customerId, 'trip.started', trip.kind === TripKind.RIDE ? 'Trip started' : 'Goods picked up', `On the way to ${trip.dropAddress}.`);
          break;
        case 'completed':
          to(trip.customerId, 'trip.completed', trip.kind === TripKind.RIDE ? 'You have arrived' : 'Delivered', `${trip.paymentMethod === PaymentMethod.CASH ? 'Pay' : 'Charged'} ${money(trip.fare, trip.currency)}. Tap to rate your driver.`);
          to(trip.driverId, 'trip.completed', 'Trip complete', `You earned ${money(trip.driverEarning, trip.currency)}${trip.paymentMethod === PaymentMethod.CASH ? ` (collect ${money(trip.fare, trip.currency)} in cash)` : ''}.`);
          break;
        case 'cancelled_by_customer':
          to(trip.driverId, 'trip.cancelled', 'Trip cancelled', `The customer cancelled ${trip.code}.`);
          break;
        case 'cancelled_by_driver':
        case 'redispatched':
          to(trip.customerId, 'trip.redispatched', 'Your driver cancelled', 'We are finding you another driver.');
          break;
        case 'no_driver':
          to(trip.customerId, 'trip.no_driver', 'No driver available', trip.cancelReason ?? 'No one nearby could take it. Try again in a few minutes, or pick another vehicle.');
          break;
        case 'cancelled_by_admin':
          to(trip.customerId, 'trip.cancelled', 'Trip cancelled by ORBIT', trip.cancelReason ?? `${trip.code} was cancelled by ORBIT support.`);
          to(trip.driverId, 'trip.cancelled', 'Trip cancelled by ORBIT', `${trip.code} was cancelled by ORBIT support.`);
          break;
      }
      await this.notifications.push(out);
    } catch (e) {
      this.log.warn(`Trip event ${event} for ${trip.code} was not fully delivered: ${(e as Error).message}`);
    }
  }

  /** A promo is given back when the trip never really happened (no driver, or a free cancellation). */
  async releasePromo(trip: Trip): Promise<void> {
    if (!trip.promoCode) return;
    try {
      const red = await this.redemptions.findOne({ where: { tripId: trip.id } });
      if (!red) return;
      await this.redemptions.delete({ id: red.id });
      await this.promos.decrement({ id: red.promoId }, 'usedCount', 1);
    } catch (e) {
      this.log.warn(`Could not release promo for ${trip.code}: ${(e as Error).message}`);
    }
  }
}
