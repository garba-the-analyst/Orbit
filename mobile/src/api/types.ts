/**
 * Types mirroring the ORBIT API responses (see backend/src and the Swagger docs at /api/docs).
 * Money is whole currency units (integers); the currency code travels with each record.
 */

export type Role = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DELETED';
export type Fulfilment = 'PICKUP' | 'MERCHANT_DELIVERY' | 'ORBIT_COURIER';
export type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'CONFIRMED' | 'READY' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED';
export type VehicleType = 'BICYCLE' | 'MOTORCYCLE' | 'KEKE' | 'CAR' | 'VAN' | 'TRUCK' | 'LORRY' | 'LONG_HAUL';
/** Kept as an alias: v1 screens call a rider's vehicle just "Vehicle". */
export type Vehicle = VehicleType;
export type Fleet = 'LIGHT' | 'HEAVY';
export type GoodsType = 'GENERAL' | 'FOOD' | 'PERISHABLE' | 'FRAGILE' | 'DOCUMENTS' | 'ELECTRONICS' | 'LIVESTOCK' | 'BUILDING' | 'BULK' | string;
export type TripKind = 'RIDE' | 'PARCEL';
export type TripStatus = 'SEARCHING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_DRIVER';
export type PaymentMethod = 'CARD' | 'CASH';
export type LatLng = { lat: number; lng: number };

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: AccountStatus;
  vehicle: VehicleType | null;
  fleet: Fleet | null;
  country: string;
  online: boolean;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  shop: { id: string; name: string; status: string } | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

// ---- Shops and goods -------------------------------------------------------------------------------

export interface Shop {
  id: string;
  name: string;
  description: string;
  category: string;
  address: string;
  /** The shop's sign colour (hex), used when there is no logo. */
  color: string;
  isOpen: boolean;
  prepMinutes: number;
  offersDelivery: boolean;
  deliveryFee: number;
  rating: number | null;
  ratingCount: number;
  status: string;
  country: string;
  currency: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string;
  openingHours: string;
  distanceKm?: number | null;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description: string;
  kind: 'GOOD' | 'SERVICE';
  goodsType: GoodsType;
  images: string[];
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  unitLabel: string | null;
  price: number;
  stock: number;
  available: boolean;
  soldOut: boolean;
}

export interface ProductBody {
  name: string;
  description?: string;
  price: number;
  stock?: number;
  kind?: 'GOOD' | 'SERVICE';
  goodsType?: GoodsType;
  images?: string[];
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  unitLabel?: string | null;
  available?: boolean;
}

export interface ShopQuery {
  q?: string;
  category?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  city?: string;
  country?: string;
  openNow?: boolean;
  sort?: 'distance' | 'rating' | 'name';
  limit?: number;
  offset?: number;
}

// ---- Orders ----------------------------------------------------------------------------------------

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  kind?: 'GOOD' | 'SERVICE';
}

export interface OrderView {
  id: string;
  /** Printed on the digital waybill, e.g. ORB-261106-7K2M. */
  waybillNo: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  shop: { id: string; name: string; color: string; address: string; category: string; lat?: number | null; lng?: number | null; phone?: string | null; logoUrl?: string | null };
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency?: string;
  goods?: { types: string[]; careful: boolean; perishable: boolean } | null;
  hasService?: boolean;
  collector?: { name: string; phone: string | null } | null;
  dropoff?: { address: string; lat: number | null; lng: number | null } | null;
  /** Role-specific: merchant {itemSales, commission, yourEarnings}; rider {payout}; admin {commission, courierPayout, ...}. */
  money: Record<string, number>;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  customer: { name: string; phone: string | null } | null;
  courier: { name: string; phone: string; vehicle: VehicleType | null; avatarUrl?: string | null; isShopRider?: boolean } | null;
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
  deliveryLat?: number;
  deliveryLng?: number;
  collectorName?: string;
  collectorPhone?: string;
  deliveryNote?: string;
  contactPhone?: string;
}

// ---- Maps ------------------------------------------------------------------------------------------

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  type?: string;
  city?: string;
  state?: string;
  country?: string;
}
export interface SavedPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}
export interface RouteStep {
  instruction?: string;
  text?: string;
  distanceM: number;
  durationS?: number;
  name?: string;
}
export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: Array<[number, number]>;
  steps: RouteStep[];
  source: 'osrm' | 'estimate' | string;
}
/** A place the person picked: what the API needs for a pickup or drop-off. */
export interface Point extends LatLng {
  address: string;
}

// ---- Trips -----------------------------------------------------------------------------------------

export interface QuoteBody {
  kind: TripKind;
  pickup: Point;
  drop: Point;
  passengers?: number;
  goodsType?: GoodsType;
  weightKg?: number;
}
export interface QuoteOption {
  vehicleType: VehicleType;
  label: string;
  blurb: string;
  fleet: Fleet;
  passengers: number;
  maxWeightKg: number;
  fare: number;
  surge: number;
  surgeAmount: number;
  durationS: number;
  etaMin: number | null;
  driversNearby: number;
  available: boolean;
}
export interface Quote {
  kind: TripKind;
  currency: string;
  country: string;
  route: { distanceM: number; durationS: number; geometry: Array<[number, number]>; source: string };
  options: QuoteOption[];
}
export interface CreateTripBody extends QuoteBody {
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  acceptedSurge?: number;
  promoCode?: string;
  recipientName?: string;
  recipientPhone?: string;
  notes?: string;
}

export interface Person {
  id: string;
  firstName: string;
  name?: string;
  phone: string | null;
  rating: { average: number | null; count: number };
}

export interface TripView {
  id: string;
  code: string;
  kind: TripKind;
  status: TripStatus;
  vehicleType: VehicleType;
  vehicleLabel: string;
  currency: string;
  pickup: Point;
  drop: Point;
  distanceM: number;
  durationS: number;
  geometry: Array<[number, number]>;
  price: {
    base: number;
    distance: number;
    time: number;
    surge: number;
    fullFare: number;
    discount: number;
    promoCode: string | null;
    total: number;
    tip: number;
    cancelFee: number;
    method: PaymentMethod;
    paid: boolean;
    driverEarning?: number;
    collectInCash?: number;
    commission?: number;
  };
  cargo: {
    passengers: number;
    goodsType: string | null;
    goodsLabel: string | null;
    careful: boolean;
    urgent: boolean;
    handling: string | null;
    weightKg: number | null;
    notes: string | null;
  };
  recipient: { name: string; phone: string | null } | null;
  driver: Person | null;
  customer: Person | null;
  vehicle: { type?: string; label?: string; make?: string | null; model?: string | null; color?: string | null; plate?: string | null; photo?: string | null } | null;
  pin: { purpose: 'start' | 'drop'; code: string } | null;
  pinLocked: boolean;
  search: { wave: number; maxWaves: number; expiresAt: string | null } | null;
  cancel: { allowed: boolean; fee: number; late: boolean } | null;
  times: Record<'requestedAt' | 'acceptedAt' | 'arrivedAt' | 'startedAt' | 'completedAt' | 'cancelledAt', string | null>;
  cancelledBy: string | null;
  cancelReason: string | null;
  ratings: { given: number | null; received: number | null; comment: string | null };
  canRate: boolean;
  canTip: boolean;
  shared: boolean;
}

export interface OfferView {
  tripId: string;
  code: string;
  kind: TripKind;
  vehicleType: VehicleType;
  currency: string;
  secondsLeft: number;
  expiresAt: string;
  distanceToPickupM: number;
  pickup: Point;
  drop: Point;
  distanceM: number;
  durationS: number;
  driverEarning: number;
  paymentMethod: PaymentMethod;
  surge: number;
  cargo: { passengers: number; goodsType: string | null; goodsLabel: string | null; careful: boolean; urgent: boolean; weightKg: number | null };
  customer: { firstName: string; rating: { average: number | null; count: number } } | null;
}

export interface PublicTrack {
  code: string;
  kind: TripKind;
  status: TripStatus;
  driver: { firstName: string; rating: number | null } | null;
  [k: string]: unknown;
}

export interface PromoCheck {
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  maxDiscount: number | null;
  currency: string;
  validUntil: string | null;
}

// ---- Fleet, documents and shop riders --------------------------------------------------------------

export interface VehicleView {
  id: string;
  type: VehicleType;
  fleet: Fleet;
  label: string;
  make: string | null;
  model: string | null;
  color: string | null;
  plate: string | null;
  year: number | null;
  capacityKg: number;
  photos: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  reviewNote: string | null;
  isActive: boolean;
}
export interface VehicleBody {
  type: VehicleType;
  plate?: string;
  make?: string;
  model?: string;
  color?: string;
  year?: number;
  capacityKg?: number;
  photos?: string[];
}
export type DocumentKind = 'ID_CARD' | 'DRIVER_LICENCE' | 'VEHICLE_PAPERS' | 'BUSINESS_REG' | 'OTHER';
export interface DocumentView {
  id: string;
  kind: DocumentKind;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  mime: string;
  createdAt: string;
}
export interface UploadResult {
  url: string;
  thumb: string;
  width: number;
  height: number;
}
export interface ShopRiderLink {
  id: string;
  status: 'INVITED' | 'ACTIVE';
  riderId: string;
  name: string;
  phone: string | null;
  vehicle: VehicleType | null;
  avatarUrl: string | null;
  online: boolean;
}
export interface RiderShopLink {
  id: string;
  status: 'INVITED' | 'ACTIVE';
  shop: { id: string; name: string; address: string; city: string };
}

// ---- Notifications ---------------------------------------------------------------------------------

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

// ---- Config ----------------------------------------------------------------------------------------

export interface MarketInfo {
  code: string;
  name: string;
  currency: string;
  symbol?: string;
  dialCode?: string;
  locale?: string;
  center?: LatLng;
  centerName?: string;
  orbitDeliveryFee?: number;
}
export interface VehicleInfo {
  type: VehicleType;
  label: string;
  blurb: string;
  fleet: Fleet;
  passengers: number;
  maxWeightKg: number;
  [k: string]: unknown;
}
export interface GoodsInfo {
  type: GoodsType;
  label: string;
  careful?: boolean;
  urgent?: boolean;
  handling?: string;
  [k: string]: unknown;
}
export interface PublicConfig {
  serviceArea: string;
  defaultMarket: string;
  markets: MarketInfo[];
  currency?: string;
  commissionPct: number;
  tripCommissionPct: number;
  paymentProvider: string;
  testMode: boolean;
  categories: string[];
  legal: { version: string; consentRequired: boolean };
  pendingPaymentTtlMin: number;
  map: { provider: string; tileUrl: string; center: LatLng | [number, number]; attribution: string };
  vehicles: VehicleInfo[];
  goods: GoodsInfo[];
  demo: { password: string; accounts: Array<{ label: string; email: string; role: Role }> } | null;
}

export interface LegalDoc {
  version: string;
  terms: string;
  privacy: string;
  [k: string]: unknown;
}

// ---- Earnings and admin ----------------------------------------------------------------------------

export interface EarningsSummary {
  total: number;
  today: number;
  currency?: string;
  ordersSettled: number;
  tripsSettled?: number;
  cashHeld?: number;
  last7Days: Array<{ date: string; amount: number }>;
  recent: Array<{ orderId: string; waybillNo: string; amount: number; kind: string; at: string; source?: string; tripId?: string | null }>;
  [k: string]: unknown;
}

export interface QueueDocument {
  id: string;
  kind: DocumentKind;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  mime?: string;
  note?: string | null;
}
export interface VerificationQueue {
  merchants: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string;
    shop: { id: string; name: string; category: string; address: string; city?: string } | null;
    documents: QueueDocument[];
  }>;
  riders: Array<{
    userId: string;
    name: string;
    email: string;
    phone: string;
    vehicle: VehicleType | null;
    fleet: Fleet | null;
    createdAt: string;
    vehicles: VehicleView[];
    documents: QueueDocument[];
  }>;
}

export interface AdminView {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}
export interface AdminList {
  admins: AdminView[];
  limit: number;
  used: number;
}

export interface SosItem {
  id: string;
  status: 'OPEN' | 'RESOLVED';
  raisedBy: string;
  note: string | null;
  lat: number | null;
  lng: number | null;
  at: string;
  resolvedAt: string | null;
  person: { name: string; phone: string; role: string } | null;
  trip: { id: string; code: string; status: string; kind: string; pickup: string; drop: string; vehicle: unknown } | null;
}

export interface ComplaintView {
  id: string;
  userId: string;
  category: 'ORDER' | 'DELIVERY' | 'RIDER' | 'MERCHANT' | 'PAYMENT' | 'APP' | 'OTHER';
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
  adminResponse: string | null;
  handledById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  person: { name: string; phone: string; role: string } | null;
}

export interface Promo {
  id: string;
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  maxDiscount: number | null;
  currency: string;
  validUntil: string | null;
  maxUses: number | null;
  uses?: number;
  active: boolean;
}

export interface Kpis {
  generatedAt: string;
  currency?: string;
  currencies?: string[];
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
  mobility: {
    completedTrips: number;
    rides: number;
    parcels: number;
    gmv: number;
    averageFare: number | null;
    completionRatePct: number | null;
    searchingNow: number;
    onTheRoadNow: number;
    averageDriverRating: number | null;
    openSafetyAlerts: number;
    platformRevenue: number;
    owedToDrivers: number;
    cashCommissionDue: number;
    [k: string]: unknown;
  };
  verificationQueue: { pendingMerchants: number; pendingRiders: number };
}

export interface RegisterBody {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'RIDER';
  acceptTerms?: boolean;
  shopName?: string;
  shopCategory?: string;
  shopAddress?: string;
  vehicle?: VehicleType;
  plate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
}

/** Fallback only: the live list comes from /config (`categories`). */
export const SHOP_CATEGORIES = ['Food', 'Groceries', 'Farm produce', 'Fashion', 'Beauty & Health', 'Gadgets', 'Home & Hardware', 'Stationery', 'Services'] as const;
