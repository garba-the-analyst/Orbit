/**
 * What each order status means to each person, in plain words.
 * One place, so the same status is never described two different ways.
 */
import type { Fulfilment, OrderStatus, OrderView } from '../api/types';

export interface Stop {
  key: OrderStatus;
  label: string;
}

/** The stops an order travels through (excluding cancellation) for each fulfilment mode. */
export function stopsFor(fulfilment: Fulfilment): Stop[] {
  const common: Stop[] = [
    { key: 'PLACED', label: 'Order sent' },
    { key: 'CONFIRMED', label: 'Shop is preparing' },
    { key: 'READY', label: fulfilment === 'PICKUP' ? 'Ready to collect' : 'Packed and ready' },
  ];
  if (fulfilment === 'PICKUP') return [...common, { key: 'DELIVERED', label: 'Collected' }];
  return [...common, { key: 'ON_THE_WAY', label: 'On the way' }, { key: 'DELIVERED', label: 'Delivered' }];
}

/** Position (0-based) of the current status among the stops; -1 if before the first stop. */
export function stopIndex(order: Pick<OrderView, 'status' | 'fulfilment'>): number {
  return stopsFor(order.fulfilment).findIndex((s) => s.key === order.status);
}

/** The customer's headline for an order, as a short phrase. */
export function customerHeadline(o: OrderView): string {
  switch (o.status) {
    case 'PENDING_PAYMENT':
      return 'Waiting for payment';
    case 'PLACED':
      return 'Waiting for the shop to confirm';
    case 'CONFIRMED':
      return 'The shop is preparing your order';
    case 'READY':
      if (o.fulfilment === 'PICKUP') return 'Ready for you to collect';
      return o.courier || o.fulfilment === 'MERCHANT_DELIVERY' ? 'Packed. Heading out soon' : 'Packed. Finding a rider';
    case 'ON_THE_WAY':
      return 'On the way to you';
    case 'DELIVERED':
      return o.fulfilment === 'PICKUP' ? 'Collected' : 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

/** Short status for list rows. */
export function shortStatus(o: Pick<OrderView, 'status' | 'fulfilment'>): { text: string; tone: 'good' | 'warn' | 'bad' | 'ink' } {
  switch (o.status) {
    case 'PENDING_PAYMENT':
      return { text: 'Unpaid', tone: 'warn' };
    case 'PLACED':
      return { text: 'Sent to shop', tone: 'ink' };
    case 'CONFIRMED':
      return { text: 'Preparing', tone: 'ink' };
    case 'READY':
      return { text: o.fulfilment === 'PICKUP' ? 'Ready to collect' : 'Packed', tone: 'ink' };
    case 'ON_THE_WAY':
      return { text: 'On the way', tone: 'ink' };
    case 'DELIVERED':
      return { text: o.fulfilment === 'PICKUP' ? 'Collected' : 'Delivered', tone: 'good' };
    case 'CANCELLED':
      return { text: 'Cancelled', tone: 'bad' };
  }
}

export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  PICKUP: 'Pickup',
  MERCHANT_DELIVERY: 'Shop delivers',
  ORBIT_COURIER: 'ORBIT rider',
};

export const isActive = (o: Pick<OrderView, 'status'>) =>
  ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'READY', 'ON_THE_WAY'].includes(o.status);

/** Short title for the middle of the order tracker ring (it has room for about three short words). */
export function trackerTitle(o: Pick<OrderView, 'status' | 'fulfilment'>): string {
  if (o.status === 'PENDING_PAYMENT') return 'Waiting for payment';
  if (o.status === 'CANCELLED') return 'Cancelled';
  return stopsFor(o.fulfilment)[stopIndex(o)]?.label ?? '';
}
