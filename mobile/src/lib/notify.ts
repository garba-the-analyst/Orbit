import type { NotificationView, Role } from '../api/types';

/** Where tapping a notification should take each role. */
export function routeForNotification(n: Pick<NotificationView, 'data' | 'type'>, role: Role | null): string {
  const { tripId, orderId } = n.data ?? {};
  if (role === 'RIDER') return tripId ? '/r/drive' : orderId ? '/r/active' : '/r/drive';
  if (role === 'ADMIN') return n.type === 'sos' ? '/a/safety' : '/a/queue';
  if (role === 'MERCHANT' && orderId && !tripId) return '/m/orders';
  if (tripId) return `/c/trip/${tripId}`;
  if (orderId) return `/c/order/${orderId}`;
  return '/n';
}
