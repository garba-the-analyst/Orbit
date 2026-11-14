/**
 * Every API call the app makes, in one place. Screens import `api` and never build URLs themselves.
 */
import { del, get, getPage, patch, post, put, upload } from './client';
import type {
  AdminList,
  AdminView,
  AuthResult,
  CreateOrderBody,
  CreateTripBody,
  DocumentKind,
  DocumentView,
  EarningsSummary,
  Kpis,
  LegalDoc,
  NotificationView,
  OfferView,
  OrderView,
  PaymentIntent,
  PlaceResult,
  Product,
  ProductBody,
  PromoCheck,
  Promo,
  PublicConfig,
  PublicTrack,
  Quote,
  QuoteBody,
  RegisterBody,
  RiderShopLink,
  ComplaintView,
  ErrorLogView,
  RouteResult,
  SavedPlace,
  Shop,
  ShopQuery,
  ShopRiderLink,
  SosItem,
  TripView,
  UploadResult,
  User,
  VehicleBody,
  VehicleType,
  VehicleView,
  VerificationQueue,
} from './types';

const qs = (o: object) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export type UploadKind = 'avatar' | 'logo' | 'cover' | 'product' | 'vehicle';

export const api = {
  config: () => get<PublicConfig>('/config'),
  legal: () => get<LegalDoc>('/legal'),

  // ---- Account ----------------------------------------------------------------------------------
  login: (email: string, password: string) => post<AuthResult>('/auth/login', { email, password }),
  register: (body: RegisterBody) => post<AuthResult>('/auth/register', body),
  forgotPassword: (email: string) => post<{ ok: true }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<{ ok: true }>('/auth/reset-password', { token, password }),
  me: () => get<User>('/me'),
  updateMe: (body: { name?: string; phone?: string; avatarUrl?: string | null }) => patch<User>('/me', body),
  changePassword: (currentPassword: string, newPassword: string) => post<AuthResult | { ok: true }>('/me/password', { currentPassword, newPassword }),
  exportData: () => get<Record<string, unknown>>('/me/export'),
  deleteAccount: (password: string) => post<{ ok: true }>('/me/delete', { password }),

  // ---- Complaints -------------------------------------------------------------------------------
  complaints: () => get<ComplaintView[]>('/complaints/mine'),
  createComplaint: (body: { category: string; subject: string; message: string }) =>
    post<ComplaintView>('/complaints', body),

  // ---- Uploads (pictures are public; documents are private to admins) -------------------------
  uploadImage: (kind: UploadKind, file: Blob, name?: string) => upload<UploadResult>(`/uploads?kind=${kind}`, file, name),
  uploadDocument: (kind: DocumentKind, file: Blob, name?: string) => upload<DocumentView>(`/documents?kind=${kind}`, file, name),
  documents: () => get<DocumentView[]>('/documents'),
  deleteDocument: (id: string) => del<{ ok: true }>(`/documents/${id}`),

  // ---- Maps --------------------------------------------------------------------------------------
  route: (from: { lat: number; lng: number }, to: { lat: number; lng: number }, vehicle?: VehicleType) =>
    get<RouteResult>(`/geo/route${qs({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng, vehicle })}`),
  searchPlaces: (q: string, near?: { lat: number; lng: number }) =>
    get<{ online: boolean; results: PlaceResult[] }>(`/geo/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),
  reverse: (p: { lat: number; lng: number }) => get<{ address: string | null }>(`/geo/reverse${qs({ lat: p.lat, lng: p.lng })}`),
  places: () => get<SavedPlace[]>('/places'),
  savePlace: (body: { label: string; address: string; lat: number; lng: number }) => post<SavedPlace>('/places', body),
  deletePlace: (id: string) => del<{ ok: true }>(`/places/${id}`),
  /** Drivers report their position while online. */
  sendLocation: (lat: number, lng: number, heading?: number) => put<{ ok: true }>('/rider/location', { lat, lng, ...(heading !== undefined ? { heading: Math.round(heading) } : {}) }),

  // ---- Shopping ----------------------------------------------------------------------------------
  shops: (opts: ShopQuery = {}) => getPage<Shop>(`/shops${qs(opts)}`),
  cities: () => get<Array<{ city: string; state?: string; country?: string; count?: number }>>('/shops/cities'),
  shop: (id: string) => get<{ shop: Shop; products: Product[] }>(`/shops/${id}`),
  favourites: () => get<Shop[]>('/favourites'),
  favouriteIds: () => get<string[]>('/favourites/ids'),
  favourite: (shopId: string) => put<{ ok: true }>(`/favourites/${shopId}`, {}),
  unfavourite: (shopId: string) => del<{ ok: true }>(`/favourites/${shopId}`),

  createOrder: (body: CreateOrderBody) => post<{ order: OrderView; payment: PaymentIntent }>('/orders', body),
  orders: () => get<OrderView[]>('/orders'),
  order: (id: string) => get<OrderView>(`/orders/${id}`),
  orderTracking: (id: string) => get<{ orderId?: string; status: string; courier: { lat: number; lng: number; heading: number | null; updatedAt: string } | null }>(`/orders/${id}/tracking`),
  reorder: (id: string) => get<{ shopId: string; items: Array<{ productId: string; qty: number }>; skipped?: string[] }>(`/orders/${id}/reorder`),
  retryPayment: (id: string) => post<PaymentIntent>(`/orders/${id}/pay`),
  cancelOrder: (id: string, reason?: string) => post<OrderView>(`/orders/${id}/cancel`, { reason }),
  rateOrder: (id: string, rating: number, comment?: string) => post<OrderView>(`/orders/${id}/rate`, { rating, comment }),
  /** Test mode only: plays the payment gateway. */
  simulatePayment: (reference: string, outcome: 'success' | 'failed') => post<{ ok: true }>(`/payments/${reference}/simulate`, { outcome }),

  /** Paystack: initialize a transaction and get the authorization URL. */
  initializePayment: (body: { reference: string; email: string; callbackUrl: string }) =>
    post<{ authorizationUrl: string; accessCode: string; reference: string }>('/payments/initialize', body),

  /** Paystack return page: server-rendered HTML that redirects back to the app. */
  paymentReturnUrl: (reference: string, returnTo: string) =>
    `/payments/return?reference=${encodeURIComponent(reference)}&returnTo=${encodeURIComponent(returnTo)}`,

  // ---- Trips (customer) --------------------------------------------------------------------------
  quote: (body: QuoteBody) => post<Quote>('/trips/quote', body),
  createTrip: (body: CreateTripBody) => post<TripView>('/trips', body),
  checkPromo: (code: string, currency?: string) => post<PromoCheck>('/trips/promo/check', { code, ...(currency ? { currency } : {}) }),
  activeTrip: () => get<TripView | { none: true }>('/trips/active'),
  trips: (scope: 'active' | 'past', limit = 20, offset = 0) => getPage<TripView>(`/trips${qs({ scope, limit, offset })}`),
  trip: (id: string) => get<TripView>(`/trips/${id}`),
  tripTracking: (id: string) => get<{ tripId: string; status: string; driver: { lat: number; lng: number; heading: number | null; updatedAt: string } | null }>(`/trips/${id}/tracking`),
  cancelTrip: (id: string, reason?: string) => post<TripView>(`/trips/${id}/cancel`, { reason }),
  rateTrip: (id: string, rating: number, comment?: string) => post<TripView>(`/trips/${id}/rate`, { rating, comment }),
  tipTrip: (id: string, amount: number) => post<TripView>(`/trips/${id}/tip`, { amount }),
  shareTrip: (id: string) => post<{ token: string; url?: string; expiresAt?: string }>(`/trips/${id}/share`),
  unshareTrip: (id: string) => del<{ ok: true }>(`/trips/${id}/share`),
  sos: (id: string, note?: string, at?: { lat: number; lng: number }) => post<{ ok: true }>(`/trips/${id}/sos`, { note, ...at }),
  publicTrack: (token: string) => get<PublicTrack>(`/track/${token}`),

  // ---- Merchant ----------------------------------------------------------------------------------
  merchant: {
    shop: () => get<Shop>('/merchant/shop'),
    updateShop: (
      body: Partial<
        Pick<Shop, 'name' | 'description' | 'address' | 'isOpen' | 'prepMinutes' | 'offersDelivery' | 'deliveryFee' | 'city' | 'state' | 'phone' | 'openingHours' | 'lat' | 'lng'>
      > & { logoUrl?: string | null; coverUrl?: string | null },
    ) => patch<Shop>('/merchant/shop', body),
    products: () => get<Product[]>('/merchant/products'),
    createProduct: (body: ProductBody) => post<Product>('/merchant/products', body),
    updateProduct: (id: string, body: Partial<ProductBody>) => patch<Product>(`/merchant/products/${id}`, body),
    deleteProduct: (id: string) => del<void>(`/merchant/products/${id}`),
    orders: () => get<OrderView[]>('/merchant/orders'),
    accept: (id: string, prepMinutes?: number) => post<OrderView>(`/merchant/orders/${id}/accept`, { prepMinutes }),
    cancel: (id: string, reason?: string) => post<OrderView>(`/merchant/orders/${id}/cancel`, { reason }),
    ready: (id: string) => post<OrderView>(`/merchant/orders/${id}/ready`),
    /** Sends the order out with one of the shop's own riders (`riderId`) or the shop's own staff. */
    dispatch: (id: string, riderId?: string) => post<OrderView>(`/merchant/orders/${id}/dispatch`, riderId ? { riderId } : {}),
    complete: (id: string, pin: string) => post<OrderView>(`/merchant/orders/${id}/complete`, { pin }),
    earnings: () => get<EarningsSummary>('/merchant/earnings'),
    riders: () => get<ShopRiderLink[]>('/merchant/riders'),
    inviteRider: (emailOrPhone: string) => post<{ id: string; status: string; riderId: string; name: string }>('/merchant/riders', { identifier: emailOrPhone }),
    removeRider: (linkId: string) => del<{ ok: true }>(`/merchant/riders/${linkId}`),
  },

  // ---- Driver (the RIDER role: bikes, cars, keke, vans, trucks and lorries) ---------------------
  rider: {
    setOnline: (online: boolean) => put<{ online: boolean }>('/rider/availability', { online }),
    jobs: () => get<OrderView[]>('/rider/jobs'),
    active: () => get<OrderView[]>('/rider/active'),
    history: () => get<OrderView[]>('/rider/history'),
    claim: (id: string) => post<OrderView>(`/rider/jobs/${id}/claim`),
    release: (id: string) => post<OrderView>(`/rider/jobs/${id}/release`),
    pickup: (id: string) => post<OrderView>(`/rider/jobs/${id}/pickup`),
    deliver: (id: string, pin: string) => post<OrderView>(`/rider/jobs/${id}/deliver`, { pin }),
    earnings: () => get<EarningsSummary>('/rider/earnings'),
    offers: () => get<OfferView[]>('/driver/offers'),
    acceptOffer: (tripId: string) => post<TripView>(`/driver/offers/${tripId}/accept`),
    declineOffer: (tripId: string) => post<{ ok: true }>(`/driver/offers/${tripId}/decline`),
    activeTrip: () => get<TripView | { none: true }>('/driver/trips/active'),
    tripHistory: (limit = 20, offset = 0) => getPage<TripView>(`/driver/trips${qs({ limit, offset })}`),
    arrived: (id: string, at?: { lat: number; lng: number }) => post<TripView>(`/driver/trips/${id}/arrived`, at ?? {}),
    startTrip: (id: string, pin?: string) => post<TripView>(`/driver/trips/${id}/start`, pin ? { pin } : {}),
    completeTrip: (id: string, pin?: string) => post<TripView>(`/driver/trips/${id}/complete`, pin ? { pin } : {}),
    cancelTrip: (id: string) => post<TripView>(`/driver/trips/${id}/cancel`),
    rateCustomer: (id: string, rating: number, comment?: string) => post<TripView>(`/trips/${id}/rate`, { rating, comment }),
    vehicles: () => get<VehicleView[]>('/vehicles'),
    addVehicle: (body: VehicleBody) => post<VehicleView>('/vehicles', body),
    updateVehicle: (id: string, body: Partial<VehicleBody>) => patch<VehicleView>(`/vehicles/${id}`, body),
    activateVehicle: (id: string) => post<VehicleView>(`/vehicles/${id}/activate`),
    removeVehicle: (id: string) => del<{ ok: true }>(`/vehicles/${id}`),
    shops: () => get<RiderShopLink[]>('/rider/shops'),
    acceptShop: (id: string) => post<{ ok: true }>(`/rider/shops/${id}/accept`),
    leaveShop: (id: string) => del<{ ok: true }>(`/rider/shops/${id}`),
  },

  notifications: {
    list: (limit = 40, before?: string) => get<NotificationView[]>(`/notifications${qs({ limit, before })}`),
    unread: () => get<{ unread: number }>('/notifications/unread-count'),
    read: (ids?: string[]) => post<{ ok: true }>('/notifications/read', ids ? { ids } : {}),
    clear: () => del<{ ok: true }>('/notifications'),
  },

  // ---- Admin -------------------------------------------------------------------------------------
  admin: {
    queue: () => get<VerificationQueue>('/admin/queue'),
    approve: (userId: string) => post<{ ok: true }>(`/admin/users/${userId}/approve`),
    suspend: (userId: string) => post<{ ok: true }>(`/admin/users/${userId}/suspend`),
    orders: () => get<OrderView[]>('/admin/orders'),
    unlockPin: (orderId: string) => post<{ ok: true }>(`/admin/orders/${orderId}/unlock-pin`),
    kpis: () => get<Kpis>('/admin/kpis'),
    userDocuments: (userId: string) => get<DocumentView[]>(`/admin/documents/user/${userId}`),
    reviewDocument: (id: string, status: 'APPROVED' | 'REJECTED', note?: string) => post<{ ok: true }>(`/admin/documents/${id}/review`, { status, note }),
    approveVehicle: (id: string) => post<VehicleView>(`/admin/vehicles/${id}/approve`),
    rejectVehicle: (id: string, note: string) => post<VehicleView>(`/admin/vehicles/${id}/reject`, { note }),
    trips: (status: string | undefined, limit = 30, offset = 0) => getPage<TripView>(`/admin/trips${qs({ status, limit, offset })}`),
    unlockTrip: (id: string) => post<{ ok: true }>(`/admin/trips/${id}/unlock-pin`),
    cancelTrip: (id: string, reason?: string) => post<{ ok: true }>(`/admin/trips/${id}/cancel`, { reason }),
    sos: (status: 'OPEN' | 'RESOLVED' = 'OPEN') => get<SosItem[]>(`/admin/sos${qs({ status })}`),
    resolveSos: (id: string, note?: string) => post<{ ok: true }>(`/admin/sos/${id}/resolve`, { note }),
    promos: () => get<Promo[]>('/admin/promos'),
    createPromo: (body: { code: string; type: 'PERCENT' | 'FLAT'; value: number; maxDiscount?: number; validDays?: number; maxUses?: number }) => post<Promo>('/admin/promos', body),
    setPromo: (id: string, active: boolean) => post<Promo>(`/admin/promos/${id}/${active ? 'activate' : 'deactivate'}`),
    admins: () => get<AdminList>('/admin/admins'),
    createAdmin: (body: { name: string; email: string; phone: string; password: string }) => post<AdminView>('/admin/admins', body),
    suspendAdmin: (id: string) => post<{ ok: true }>(`/admin/admins/${id}/suspend`),
    reactivateAdmin: (id: string) => post<{ ok: true }>(`/admin/admins/${id}/reactivate`),
    resetAdminPassword: (id: string, temporaryPassword: string) => post<{ ok: true }>(`/admin/admins/${id}/reset-password`, { temporaryPassword }),
    removeAdmin: (id: string) => del<{ ok: true }>(`/admin/admins/${id}`),

    // Complaints (admin)
    complaints: (status?: string) =>
      getPage<ComplaintView>(`/complaints${qs({ status })}`),
    complaint: (id: string) => get<ComplaintView>(`/complaints/${id}`),
    updateComplaint: (id: string, body: { status?: string; adminResponse?: string }) =>
      put<ComplaintView>(`/complaints/${id}`, body),
    deleteComplaint: (id: string) => del<{ ok: true }>(`/complaints/${id}`),

    // Error logs (admin view) - reviewed is true | false | undefined (= all)
    errorLogs: (reviewed?: boolean) =>
      getPage<ErrorLogView>(`/error-logs${qs({ reviewed: reviewed === undefined ? undefined : String(reviewed) })}`),
    errorLog: (id: string) => get<ErrorLogView>(`/error-logs/${id}`),
    markErrorReviewed: (id: string, reviewed: boolean) =>
      put<ErrorLogView>(`/error-logs/${id}/reviewed`, { reviewed }),
    deleteErrorLog: (id: string) => del<{ ok: true }>(`/error-logs/${id}`),
  },

  // Error logs (client-side error reporting - public)
  reportError: (body: {
    path: string;
    method: string;
    message: string;
    stack?: string;
    userAgent?: string;
    userId?: string | null;
    role?: string | null;
  }) => post<{ ok: true }>('/error-logs', body),
};
