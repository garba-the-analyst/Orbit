/**
 * Order serialisation with privacy rules.
 *
 * One order is seen differently by each party:
 * - Customer: everything about their own order, including the delivery PIN while it is needed.
 * - Merchant: customer first name; phone and address only when they must hand over the goods.
 * - Rider: nothing personal on the job board; name, phone and address only after accepting the job.
 * - Admin: full operational view, but never the PIN.
 */
import { GOODS_SPECS } from '../common/catalog';
import { Fulfilment, OrderStatus, Role } from '../common/enums';
import type { GoodsType } from '../common/enums';
import { derivePin } from '../common/pin.util';
import { config } from '../config/config';
import { Order } from './order.entity';

export interface OrderView {
  id: string;
  waybillNo: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  shop: { id: string; name: string; color: string; address: string; category: string; lat: number | null; lng: number | null; phone: string };
  items: Array<{ productId: string; name: string; unitPrice: number; qty: number; kind: string }>;
  currency: string;
  /** What is being carried and how to handle it. */
  goods: { type: string; label: string; handling: string; careful: boolean; urgent: boolean; weightKg: number | null };
  hasService: boolean;
  /** CUSTOMER_RIDER: who is collecting it. */
  collector: { name: string; phone: string | null } | null;
  /** Drop-off point on the map, shown only to people who may see the address. */
  dropoff: { lat: number; lng: number } | null;
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** Role-specific money breakdown (see viewMoney). */
  money: Record<string, number>;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  customer: { name: string; phone: string | null } | null;
  courier: { name: string; phone: string; vehicle: string | null } | null;
  /** Hidden from everyone except the customer, and only while the order is in progress. */
  pin: string | null;
  pinLocked: boolean;
  prepMinutes: number | null;
  /** When the food/goods should be ready (confirmation time + prep minutes). */
  estimatedReadyAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  rating: number | null;
  reviewText: string | null;
  /** True when this is a job-board view with personal details withheld. */
  redacted: boolean;
  timeline: {
    createdAt: string;
    paidAt: string | null;
    confirmedAt: string | null;
    readyAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
  };
}

export interface Viewer {
  id: string;
  role: Role;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * How this viewer relates to the order. It is decided by the relationship, not the account type, so a shop owner
 * looking at something they bought sees the customer view, and at something they sold sees the shop view.
 * Anyone with no relationship (a rider browsing the job board) gets the redacted board view.
 */
type Lens = 'customer' | 'merchant' | 'courier' | 'board' | 'admin';
function lensOf(order: Order, viewer: Viewer): Lens {
  if (viewer.role === Role.ADMIN) return 'admin';
  if (order.customerId === viewer.id) return 'customer';
  if (order.shop?.ownerId === viewer.id) return 'merchant';
  if (order.courierId === viewer.id) return 'courier';
  return 'board';
}

/** Lens-specific money figures. Customers see only what they pay; ORBIT's cut is visible to ORBIT and the party it concerns. */
function viewMoney(order: Order, lens: Lens): Record<string, number> {
  switch (lens) {
    case 'merchant':
      return {
        itemSales: order.subtotal,
        commission: order.commission,
        yourEarnings:
          order.subtotal - order.commission + (order.fulfilment === Fulfilment.MERCHANT_DELIVERY ? order.deliveryFee : 0),
      };
    case 'courier':
    case 'board':
      return { payout: order.courierPayout };
    case 'admin':
      return {
        commission: order.commission,
        courierPayout: order.courierPayout,
        platformDeliveryContribution: order.platformDeliveryContribution,
      };
    default:
      return {};
  }
}

function pickGoods(type: string) {
  const spec = GOODS_SPECS[type as GoodsType] ?? GOODS_SPECS.GENERAL;
  return { type: spec.type, label: spec.label, handling: spec.handling, careful: spec.careful, urgent: spec.urgent };
}

export function toOrderView(order: Order, viewer: Viewer): OrderView {
  const lens = lensOf(order, viewer);
  const isCustomer = lens === 'customer';
  const isMerchant = lens === 'merchant';
  const isAdmin = lens === 'admin';
  const isAssignedRider = lens === 'courier';
  const redacted = lens === 'board';

  const inProgress = [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY].includes(
    order.status,
  );

  // Who needs the customer's contact details and drop-off address?
  const merchantNeedsContact = isMerchant && order.fulfilment !== Fulfilment.ORBIT_COURIER;
  const merchantNeedsAddress = isMerchant && order.fulfilment === Fulfilment.MERCHANT_DELIVERY;
  const showPhone = isCustomer || isAdmin || isAssignedRider || merchantNeedsContact;
  const showAddress = isCustomer || isAdmin || isAssignedRider || merchantNeedsAddress;

  const customer =
    redacted || !order.customer
      ? null
      : { name: isCustomer ? order.customer.name : firstName(order.customer.name), phone: showPhone ? order.contactPhone : null };

  const courier = order.courier
    ? {
        name: order.courier.name,
        phone: order.courier.phone,
        vehicle: order.courier.vehicle,
      }
    : null;

  return {
    id: order.id,
    waybillNo: order.waybillNo,
    status: order.status,
    fulfilment: order.fulfilment,
    shop: {
      id: order.shop.id,
      name: order.shop.name,
      color: order.shop.color,
      address: order.shop.address,
      category: order.shop.category,
      lat: order.shop.lat,
      lng: order.shop.lng,
      phone: order.shop.phone,
    },
    items: order.items.map((i) => ({ productId: i.productId, name: i.name, unitPrice: i.unitPrice, qty: i.qty, kind: i.kind })),
    currency: order.currency,
    goods: {
      ...pickGoods(order.goodsType),
      weightKg: order.weightKg,
    },
    hasService: order.hasService,
    collector:
      order.collectorName && (isCustomer || isMerchant || isAdmin)
        ? { name: order.collectorName, phone: order.collectorPhone }
        : null,
    dropoff: showAddress && order.deliveryLat !== null && order.deliveryLng !== null ? { lat: order.deliveryLat, lng: order.deliveryLng } : null,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    money: viewMoney(order, lens),
    deliveryAddress: showAddress ? order.deliveryAddress : null,
    deliveryNote: showAddress ? order.deliveryNote : null,
    customer,
    courier: redacted ? null : courier,
    pin: isCustomer && inProgress ? derivePin(order.id, config.pinSecret) : null,
    pinLocked: order.pinLocked,
    prepMinutes: order.prepMinutes,
    estimatedReadyAt:
      order.confirmedAt && order.prepMinutes
        ? new Date(new Date(order.confirmedAt).getTime() + order.prepMinutes * 60_000).toISOString()
        : null,
    cancelledBy: order.cancelledBy,
    cancelReason: order.cancelReason,
    rating: order.rating,
    reviewText: order.reviewText,
    redacted,
    timeline: {
      createdAt: iso(order.createdAt)!,
      paidAt: iso(order.paidAt),
      confirmedAt: iso(order.confirmedAt),
      readyAt: iso(order.readyAt),
      pickedUpAt: iso(order.pickedUpAt),
      deliveredAt: iso(order.deliveredAt),
      cancelledAt: iso(order.cancelledAt),
    },
  };
}
