/**
 * Types mirroring the ORBIT API responses (see backend/src and docs/API.md).
 * All money is whole naira (integers).
 */

export type Role = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';
export type Fulfilment = 'PICKUP' | 'MERCHANT_DELIVERY' | 'ORBIT_COURIER';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'CONFIRMED'
  | 'READY'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'CANCELLED';
export type Vehicle = 'MOTORCYCLE' | 'BICYCLE' | 'KEKE';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: AccountStatus;
  vehicle: Vehicle | null;
  online: boolean;
  shop: { id: string; name: string; status: string } | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface Shop {
  id: string;
  name: string;
  description: string;
  category: string;
  address: string;
  /** The shop's sign colour (hex). */
  color: string;
  isOpen: boolean;
  prepMinutes: number;
  offersDelivery: boolean;
  deliveryFee: number;
  rating: number | null;
  ratingCount: number;
  status: string;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  available: boolean;
  soldOut: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface OrderView {
  id: string;
  /** Printed on the digital waybill, e.g. ORB-261106-7K2M. */
  waybillNo: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  shop: { id: string; name: string; color: string; address: string; category: string };
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** Role-specific: merchant {itemSales, commission, yourEarnings}; rider {payout}; admin {commission, courierPayout, platformDeliveryContribution}. */
  money: Record<string, number>;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  customer: { name: string; phone: string | null } | null;
  courier: { name: string; phone: string; vehicle: Vehicle | null } | null;
  /** Only the customer receives this, and only while the order is in progress. */
  pin: string | null;
  pinLocked: boolean;
  prepMinutes: number | null;
  estimatedReadyAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  rating: number | null;
  reviewText: string | null;
  /** True on the rider job board: personal details are withheld until the job is accepted. */
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

export interface PaymentIntent {
  reference: string;
  amount: number;
  provider: string;
}

export interface CreateOrderBody {
  shopId: string;
  items: Array<{ productId: string; qty: number }>;
  fulfilment: Fulfilment;
  deliveryAddress?: string;
  deliveryNote?: string;
  contactPhone?: string;
}

export interface PublicConfig {
  currency: string;
  pilotZone: string;
  commissionPct: number;
  orbitDeliveryFee: number;
  paymentProvider: string;
  pendingPaymentTtlMin: number;
  demo: { password: string; accounts: Array<{ label: string; email: string; role: Role }> } | null;
}

export interface EarningsSummary {
  total: number;
  today: number;
  ordersSettled: number;
  last7Days: Array<{ date: string; amount: number }>;
  recent: Array<{ orderId: string; waybillNo: string; amount: number; kind: string; at: string }>;
}

export interface VerificationQueue {
  merchants: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string;
    shop: { id: string; name: string; category: string; address: string } | null;
  }>;
  riders: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    vehicle: Vehicle | null;
    createdAt: string;
  }>;
}

export interface Kpis {
  generatedAt: string;
  marketplace: {
    activeMerchants: number;
    listedProducts: number;
    completedOrders: number;
    gmv: number;
    averageBasket: number | null;
    repeatPurchaseRatePct: number | null;
    refundRatePct: number | null;
    openOrders: number;
  };
  logistics: {
    courierDeliveries: number;
    averageDeliveryMinutes: number | null;
    orderCompletionRatePct: number | null;
    activeRiders: number;
    onlineRiders: number;
  };
  financial: {
    platformRevenue: number;
    commission: number;
    deliveryContribution: number;
    contributionPerOrder: number | null;
    owedToMerchants: number;
    owedToRiders: number;
  };
  verificationQueue: { pendingMerchants: number; pendingRiders: number };
}

export interface RegisterBody {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'RIDER';
  shopName?: string;
  shopCategory?: string;
  shopAddress?: string;
  vehicle?: Vehicle;
}

export const SHOP_CATEGORIES = ['Food', 'Groceries', 'Stationery', 'Gadgets'] as const;
