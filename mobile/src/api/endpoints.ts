/**
 * Every API call the app makes, in one place. Screens import `api` and never build URLs themselves.
 */
import { del, get, patch, post, put } from './client';
import type {
  AuthResult,
  CreateOrderBody,
  EarningsSummary,
  Kpis,
  OrderView,
  PaymentIntent,
  Product,
  PublicConfig,
  RegisterBody,
  Shop,
  User,
  VerificationQueue,
} from './types';

export const api = {
  config: () => get<PublicConfig>('/config'),

  // ---- Account ----------------------------------------------------------------------------------
  login: (email: string, password: string) => post<AuthResult>('/auth/login', { email, password }),
  register: (body: RegisterBody) => post<AuthResult>('/auth/register', body),
  me: () => get<User>('/me'),
  updateMe: (body: { name?: string; phone?: string }) => patch<User>('/me', body),

  // ---- Customer ---------------------------------------------------------------------------------
  shops: (opts: { q?: string; category?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.category) params.set('category', opts.category);
    const qs = params.toString();
    return get<Shop[]>(`/shops${qs ? `?${qs}` : ''}`);
  },
  shop: (id: string) => get<{ shop: Shop; products: Product[] }>(`/shops/${id}`),

  createOrder: (body: CreateOrderBody) =>
    post<{ order: OrderView; payment: PaymentIntent }>('/orders', body),
  orders: () => get<OrderView[]>('/orders'),
  order: (id: string) => get<OrderView>(`/orders/${id}`),
  retryPayment: (id: string) => post<PaymentIntent>(`/orders/${id}/pay`),
  cancelOrder: (id: string, reason?: string) => post<OrderView>(`/orders/${id}/cancel`, { reason }),
  rateOrder: (id: string, rating: number, comment?: string) =>
    post<OrderView>(`/orders/${id}/rate`, { rating, comment }),
  /** Test mode only: plays the payment gateway. */
  simulatePayment: (reference: string, outcome: 'success' | 'failed') =>
    post<{ ok: true }>(`/payments/${reference}/simulate`, { outcome }),

  // ---- Merchant ---------------------------------------------------------------------------------
  merchant: {
    shop: () => get<Shop>('/merchant/shop'),
    updateShop: (body: Partial<Pick<Shop, 'name' | 'description' | 'address' | 'isOpen' | 'prepMinutes' | 'offersDelivery' | 'deliveryFee'>>) =>
      patch<Shop>('/merchant/shop', body),
    products: () => get<Product[]>('/merchant/products'),
    createProduct: (body: { name: string; description?: string; price: number; stock: number; available?: boolean }) =>
      post<Product>('/merchant/products', body),
    updateProduct: (id: string, body: Partial<Pick<Product, 'name' | 'description' | 'price' | 'stock' | 'available'>>) =>
      patch<Product>(`/merchant/products/${id}`, body),
    deleteProduct: (id: string) => del<void>(`/merchant/products/${id}`),
    orders: () => get<OrderView[]>('/merchant/orders'),
    accept: (id: string, prepMinutes?: number) => post<OrderView>(`/merchant/orders/${id}/accept`, { prepMinutes }),
    cancel: (id: string, reason?: string) => post<OrderView>(`/merchant/orders/${id}/cancel`, { reason }),
    ready: (id: string) => post<OrderView>(`/merchant/orders/${id}/ready`),
    dispatch: (id: string) => post<OrderView>(`/merchant/orders/${id}/dispatch`),
    complete: (id: string, pin: string) => post<OrderView>(`/merchant/orders/${id}/complete`, { pin }),
    earnings: () => get<EarningsSummary>('/merchant/earnings'),
  },

  // ---- Rider ------------------------------------------------------------------------------------
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
  },

  // ---- Admin ------------------------------------------------------------------------------------
  admin: {
    queue: () => get<VerificationQueue>('/admin/queue'),
    approve: (userId: string) => post<{ ok: true }>(`/admin/users/${userId}/approve`),
    suspend: (userId: string) => post<{ ok: true }>(`/admin/users/${userId}/suspend`),
    orders: () => get<OrderView[]>('/admin/orders'),
    unlockPin: (orderId: string) => post<{ ok: true }>(`/admin/orders/${orderId}/unlock-pin`),
    kpis: () => get<Kpis>('/admin/kpis'),
  },
};
