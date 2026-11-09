/**
 * What each person is told when an order changes. Pure functions: easy to test, and the only place that decides
 * the wording and who hears about what.
 */
import { Fulfilment } from '../common/enums';
import { MARKETS } from '../common/markets';
import type { NewNotification } from '../notifications/notifications.service';
import { Order } from './order.entity';

export type OrderEvent = 'placed' | 'refunded_late' | 'confirmed' | 'ready' | 'claimed' | 'picked_up' | 'delivered' | 'cancelled';

export function money(amount: number, currency: string): string {
  const locale = Object.values(MARKETS).find((m) => m.currency === currency)?.locale ?? 'en';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function orderAlerts(order: Order, event: OrderEvent): NewNotification[] {
  const shopOwner = order.shop.ownerId;
  const data = { orderId: order.id };
  const ref = order.waybillNo;
  const shop = order.shop.name;
  const items = order.items.reduce((n, i) => n + i.qty, 0);
  const handover = order.fulfilment === Fulfilment.PICKUP || order.fulfilment === Fulfilment.CUSTOMER_RIDER;
  const courier = order.courier?.name ?? 'Your rider';

  switch (event) {
    case 'placed':
      return [
        { userId: shopOwner, type: 'order.placed', title: `New order ${ref}`, body: `${items} ${items === 1 ? 'item' : 'items'}, ${money(order.total, order.currency)}. Accept it to start.`, data },
        { userId: order.customerId, type: 'order.paid', title: 'Payment received', body: `${shop} has your order ${ref}.`, data },
      ];
    case 'refunded_late':
      return [{ userId: order.customerId, type: 'order.refunded', title: 'Payment refunded', body: `Your payment for ${ref} arrived after the order expired, so it was refunded.`, data }];
    case 'confirmed':
      return [{ userId: order.customerId, type: 'order.confirmed', title: `${shop} accepted your order`, body: order.prepMinutes ? `It will be ready in about ${order.prepMinutes} minutes.` : 'They are preparing it now.', data }];
    case 'ready':
      return [
        { userId: order.customerId, type: 'order.ready', title: handover ? 'Ready for collection' : 'Packed and ready', body: handover ? `Collect ${ref} from ${shop}. Have your PIN ready.` : `${shop} has packed ${ref}.`, data },
        { userId: order.courierId, type: 'order.ready', title: 'Order ready for pickup', body: `${ref} is packed at ${shop}.`, data },
      ];
    case 'claimed':
      return [
        { userId: order.customerId, type: 'order.rider', title: `${courier} is on the way to the shop`, body: `They will collect ${ref} and bring it to you.`, data },
        { userId: shopOwner, type: 'order.rider', title: `${courier} will collect ${ref}`, body: 'Have it ready for them.', data },
      ];
    case 'picked_up':
      return [
        { userId: order.customerId, type: 'order.on_the_way', title: 'Your order is on its way', body: 'Give your PIN only when you have the goods in your hands.', data },
        ...(order.fulfilment === Fulfilment.MERCHANT_DELIVERY && order.courierId
          ? [{ userId: order.courierId, type: 'order.assigned', title: `Delivery for ${shop}`, body: `${ref} is assigned to you.`, data }]
          : []),
      ];
    case 'delivered': {
      const shopEarns = order.subtotal - order.commission + (order.fulfilment === Fulfilment.MERCHANT_DELIVERY ? order.deliveryFee : 0);
      return [
        { userId: order.customerId, type: 'order.delivered', title: handover ? 'Collected. Thank you!' : 'Delivered. Enjoy!', body: `How was ${shop}? Leave a quick rating.`, data },
        { userId: shopOwner, type: 'order.completed', title: `${ref} completed`, body: `You earned ${money(shopEarns, order.currency)}.`, data },
        ...(order.courierPayout > 0
          ? [{ userId: order.courierId, type: 'order.earned', title: 'Delivery complete', body: `You earned ${money(order.courierPayout, order.currency)}.`, data }]
          : []),
      ];
    }
    case 'cancelled': {
      const why = order.cancelReason ? ` ${order.cancelReason}.` : '';
      return [
        ...(order.cancelledBy !== 'CUSTOMER' ? [{ userId: order.customerId, type: 'order.cancelled', title: `Order ${ref} cancelled`, body: `${why} Any payment has been refunded.`.trim(), data }] : []),
        ...(order.cancelledBy !== 'MERCHANT' ? [{ userId: shopOwner, type: 'order.cancelled', title: `Order ${ref} cancelled`, body: why.trim() || 'The order was cancelled.', data }] : []),
        { userId: order.courierId, type: 'order.cancelled', title: `Order ${ref} cancelled`, body: 'You no longer need to collect it.', data },
      ];
    }
  }
}
