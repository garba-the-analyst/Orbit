/**
 * The demo backend: a small in-browser imitation of the ORBIT API, so every screen and workflow can be explored
 * with no server and no database. State lives in memory and is saved to this device's local storage; "Reset demo"
 * in Account starts over.
 *
 * Because one device plays one person at a time, the other people in each story are simulated ("autopilot"):
 * shops confirm orders, drivers accept rides and move along the route, couriers deliver. When you are signed in as
 * the shop or the driver yourself, autopilot steps aside for that stage so you can do it by hand.
 */
import { bus } from './bus';
import { ago, along, curve, DB_VERSION, iso, metres, nowMs, PLACES, seed, uid, type Db, type Row } from './data';
import { CAR_DETAILS, DRIVER_FOR, fareFor, GOODS, goodsInfo, placeFor, routeBetween, VEHICLES, vehicleInfo } from './engine';
import { CATEGORIES } from './data';

const KEY = 'orbit.demo.db';
class DemoError extends Error {
  constructor(public status: number, message: string, public body: Row = {}) {
    super(message);
  }
}
const E = (status: number, message: string, body: Row = {}) => new DemoError(status, message, body);
class Paged {
  constructor(public items: unknown[], public total: number) {}
}

// ---- state ---------------------------------------------------------------------------------------------
let db: Db;
let viewer: Row | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.v === DB_VERSION) return parsed;
    }
  } catch {
    /* start fresh */
  }
  const fresh = seed();
  seedActivity(fresh);
  return fresh;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* storage full or unavailable: the demo keeps working in memory */
    }
  }, 400);
}
export function demoReset() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('orbit.token');
  } catch {
    /* ignore */
  }
  location.reload();
}

const byId = (rows: Row[], id: string | null | undefined) => rows.find((r) => r.id === id);
const user = (id: string | null | undefined) => byId(db.users, id);

// ---- views ---------------------------------------------------------------------------------------------
function userView(u: Row): Row {
  const shop = u.shopId ? byId(db.shops, u.shopId) : null;
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, vehicle: u.vehicle, fleet: u.fleet, country: 'NG', online: !!u.online, avatarUrl: u.avatarUrl, isSuperAdmin: !!u.isSuperAdmin, mustChangePassword: false, shop: shop ? { id: shop.id, name: shop.name, status: shop.status } : null };
}
const ratingOf = (u: Row) => ({ average: u.role === 'RIDER' ? 4.7 : 4.8, count: 20 + (u.name.length % 9) * 7 });
const personView = (u: Row | undefined) => (u ? { id: u.id, firstName: u.name.split(' ')[0], name: u.name, phone: u.phone, rating: ratingOf(u) } : null);

function shopView(s: Row, near?: { lat: number; lng: number }): Row {
  const { ownerId: _o, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, distanceKm: near && s.lat != null ? Math.round((metres(near, s as { lat: number; lng: number }) / 1000) * 10) / 10 : null };
}
function productView(p: Row): Row {
  return { ...p, soldOut: p.kind === 'GOOD' && p.stock <= 0 };
}

const ORBIT_FEE = 700;
const ORBIT_PAYOUT = 400;
function orderMoney(o: Row) {
  const commission = Math.round(o.subtotal * 0.08);
  return { itemSales: o.subtotal, commission, yourEarnings: o.subtotal - commission + (o.fulfilment === 'MERCHANT_DELIVERY' ? o.deliveryFee : 0), payout: o.fulfilment === 'ORBIT_COURIER' ? ORBIT_PAYOUT : o.deliveryFee, total: o.total };
}
function orderView(o: Row, v: Row | null): Row {
  const shop = byId(db.shops, o.shopId) ?? {};
  const cust = user(o.customerId);
  const courier = user(o.courierId);
  const types = [...new Set<string>(o.items.map((i: Row) => byId(db.products, i.productId)?.goodsType ?? 'GENERAL'))].filter((t) => t !== 'GENERAL');
  const mine = v?.id === o.customerId;
  const live = !['DELIVERED', 'CANCELLED', 'PENDING_PAYMENT'].includes(o.status);
  return {
    id: o.id, waybillNo: o.no, status: o.status, fulfilment: o.fulfilment,
    shop: { id: shop.id, name: shop.name, color: shop.color, address: shop.address, category: shop.category, lat: shop.lat, lng: shop.lng, phone: shop.phone, logoUrl: shop.logoUrl },
    items: o.items.map((i: Row) => ({ productId: i.productId, name: i.name, unitPrice: i.unitPrice, qty: i.qty, kind: i.kind })),
    itemCount: o.items.reduce((n: number, i: Row) => n + i.qty, 0), subtotal: o.subtotal, deliveryFee: o.deliveryFee, total: o.total, currency: 'NGN',
    goods: types.length ? { types, careful: types.some((t) => goodsInfo(t)?.careful), perishable: types.some((t) => t === 'FOOD' || t === 'PERISHABLE') } : null,
    hasService: o.items.some((i: Row) => i.kind === 'SERVICE'),
    collector: o.collector ?? null,
    dropoff: o.fulfilment === 'PICKUP' ? null : { address: o.address, lat: o.lat, lng: o.lng },
    money: orderMoney(o), deliveryAddress: o.address ?? null, deliveryNote: o.note ?? null,
    customer: cust ? { name: cust.name, phone: cust.phone } : null,
    courier: courier ? { name: courier.name, phone: courier.phone, vehicle: courier.vehicle, avatarUrl: courier.avatarUrl, isShopRider: !!o.shopRider } : null,
    pin: mine && live ? o.pin : null, pinLocked: false, prepMinutes: o.prepMinutes ?? null, estimatedReadyAt: o.estimatedReadyAt ?? null,
    cancelledBy: o.cancelledBy ?? null, cancelReason: o.cancelReason ?? null, rating: o.rating ?? null, reviewText: o.review ?? null, redacted: false,
    timeline: { createdAt: o.createdAt, paidAt: o.paidAt ?? null, confirmedAt: o.confirmedAt ?? null, readyAt: o.readyAt ?? null, pickedUpAt: o.pickedUpAt ?? null, deliveredAt: o.deliveredAt ?? null, cancelledAt: o.cancelledAt ?? null },
  };
}

function tripView(t: Row, v: Row | null): Row {
  const driver = user(t.driverId);
  const cust = user(t.customerId);
  const asDriver = v?.id === t.driverId;
  const goods = goodsInfo(t.goodsType);
  const live = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status);
  const myRating = asDriver ? t.ratings?.byDriver : t.ratings?.byCustomer;
  const theirRating = asDriver ? t.ratings?.byCustomer : t.ratings?.byDriver;
  const total = Math.max(0, t.fare.fullFare - t.discount);
  const showPin = !asDriver && v?.role !== 'ADMIN' && (t.kind === 'RIDE' ? ['ACCEPTED', 'ARRIVED'].includes(t.status) : ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status));
  return {
    id: t.id, code: t.code, kind: t.kind, status: t.status, vehicleType: t.vehicleType, vehicleLabel: vehicleInfo(t.vehicleType).label, currency: 'NGN',
    pickup: t.pickup, drop: t.drop, distanceM: t.distanceM, durationS: t.durationS, geometry: t.geometry,
    price: { base: t.fare.base, distance: t.fare.distance, time: t.fare.time, surge: t.fare.surgeAmount, fullFare: t.fare.fullFare, discount: t.discount, promoCode: t.promoCode ?? null, total, tip: t.tip, cancelFee: t.cancelFee, method: t.method, paid: !!t.paid, driverEarning: Math.round(total * 0.9) + t.tip, collectInCash: t.method === 'CASH' ? total : 0, commission: Math.round(total * 0.1) },
    cargo: { passengers: t.passengers, goodsType: t.goodsType ?? null, goodsLabel: goods?.label ?? null, careful: !!goods?.careful, urgent: !!goods?.urgent, handling: goods?.handling ?? null, weightKg: t.weightKg ?? null, notes: t.notes ?? null },
    recipient: t.recipient ?? null,
    driver: asDriver ? null : personView(driver), customer: asDriver || v?.role === 'ADMIN' ? personView(cust) : null,
    vehicle: driver ? { type: t.vehicleType, label: vehicleInfo(t.vehicleType).label, ...CAR_DETAILS[t.vehicleType], photo: null } : null,
    pin: showPin ? { purpose: t.kind === 'RIDE' ? 'start' : 'drop', code: t.pin } : null, pinLocked: false,
    search: t.status === 'SEARCHING' ? { wave: 1, maxWaves: 3, expiresAt: iso(t.createdMs + 30_000) } : null,
    cancel: live && !asDriver ? { allowed: true, fee: ['ARRIVED'].includes(t.status) ? 300 : 0, late: t.status === 'ARRIVED' } : null,
    times: { requestedAt: iso(t.createdMs), acceptedAt: t.acceptedMs ? iso(t.acceptedMs) : null, arrivedAt: t.arrivedMs ? iso(t.arrivedMs) : null, startedAt: t.startedMs ? iso(t.startedMs) : null, completedAt: t.completedMs ? iso(t.completedMs) : null, cancelledAt: t.cancelledMs ? iso(t.cancelledMs) : null },
    cancelledBy: t.cancelledBy ?? null, cancelReason: t.cancelReason ?? null,
    ratings: { given: myRating?.stars ?? null, received: theirRating?.stars ?? null, comment: theirRating?.comment ?? null },
    canRate: t.status === 'COMPLETED' && !myRating, canTip: t.status === 'COMPLETED' && !asDriver, shared: !!t.shareToken,
  };
}

function notify(userId: string, type: string, title: string, body: string, data: Record<string, string> = {}) {
  db.notifs.unshift({ id: uid('n'), userId, type, title, body, data, read: false, createdAt: iso() });
  db.notifs = db.notifs.slice(0, 80);
  if (viewer?.id === userId) bus.emit('notification.new');
}

// ---- builders ------------------------------------------------------------------------------------------
let tripNo = 4200;
let orderNo = 1700;
function makeTrip(p: { kind: 'RIDE' | 'PARCEL'; pickup: Row; drop: Row; vehicleType: string; method: string; customerId: string; passengers?: number; goodsType?: string | null; weightKg?: number | null; notes?: string; recipient?: Row | null; promoCode?: string | null; discount?: number; status?: string; driverId?: string | null; demoOffer?: boolean; createdMs?: number }): Row {
  const r = routeBetween(p.pickup as { lat: number; lng: number }, p.drop as { lat: number; lng: number });
  const fare = fareFor(p.vehicleType, r.distanceM, r.durationS);
  const t: Row = {
    id: uid('t'), code: `T${tripNo++}`, kind: p.kind, status: p.status ?? 'SEARCHING', vehicleType: p.vehicleType, method: p.method, customerId: p.customerId, driverId: p.driverId ?? null,
    pickup: p.pickup, drop: p.drop, distanceM: r.distanceM, durationS: r.durationS, geometry: r.geometry, fare, discount: p.discount ?? 0, promoCode: p.promoCode ?? null,
    passengers: p.passengers ?? 1, goodsType: p.goodsType ?? null, weightKg: p.weightKg ?? null, notes: p.notes ?? '', recipient: p.recipient ?? null, tip: 0, cancelFee: 0, paid: false,
    pin: String(1000 + Math.floor(Math.random() * 9000)), createdMs: p.createdMs ?? nowMs(), ratings: {}, demoOffer: !!p.demoOffer,
  };
  db.trips.unshift(t);
  return t;
}

function makeOrder(p: { customerId: string; shopId: string; items: Array<{ productId: string; qty: number }>; fulfilment: string; address?: string; lat?: number | null; lng?: number | null; note?: string; collector?: Row | null; status?: string; ageMin?: number }): Row {
  const shop = byId(db.shops, p.shopId);
  if (!shop) throw E(404, 'That shop is not available.');
  const lines = p.items.map((i) => {
    const prod = byId(db.products, i.productId);
    if (!prod || prod.shopId !== p.shopId) throw E(400, 'One of the items is no longer available.');
    if (prod.kind === 'GOOD' && prod.stock < i.qty) throw E(409, `${prod.name} has only ${prod.stock} left.`);
    return { productId: prod.id, name: prod.name, unitPrice: prod.price, qty: i.qty, kind: prod.kind };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const deliveryFee = p.fulfilment === 'PICKUP' ? 0 : p.fulfilment === 'MERCHANT_DELIVERY' ? shop.deliveryFee : ORBIT_FEE;
  const age = (p.ageMin ?? 0) * 60_000;
  const created = nowMs() - age;
  const o: Row = {
    id: uid('o'), no: `ORB-${orderNo++}`, status: p.status ?? 'PENDING_PAYMENT', fulfilment: p.fulfilment, shopId: p.shopId, customerId: p.customerId, items: lines, subtotal, deliveryFee, total: subtotal + deliveryFee,
    address: p.address ?? shop.address, lat: p.lat ?? shop.lat + 0.01, lng: p.lng ?? shop.lng + 0.012, note: p.note ?? null, collector: p.collector ?? null, pin: String(1000 + Math.floor(Math.random() * 9000)),
    ref: uid('ref'), courierId: null, createdAt: iso(created), createdMs: created,
  };
  if (o.status !== 'PENDING_PAYMENT') { o.paidAt = iso(created + 5000); o.paidMs = created + 5000; }
  db.orders.unshift(o);
  return o;
}

function seedActivity(d: Db) {
  const keep = db;
  db = d;
  const jollof = d.products.find((p) => p.shopId === 's_nkechi')!.id;
  const o1 = makeOrder({ customerId: 'u_cust', shopId: 's_nkechi', items: [{ productId: jollof, qty: 2 }], fulfilment: 'MERCHANT_DELIVERY', address: 'Gwarinpa Estate, Abuja', status: 'DELIVERED', ageMin: 60 * 48 });
  Object.assign(o1, { rating: 5, review: 'Hot and on time. Thank you!', courierId: 'd_moto', shopRider: true, confirmedAt: ago(2870), readyAt: ago(2860), pickedUpAt: ago(2850), deliveredAt: ago(2830) });
  makeOrder({ customerId: 'c_ngozi', shopId: 's_nkechi', items: [{ productId: d.products.filter((p) => p.shopId === 's_nkechi')[1].id, qty: 1 }, { productId: d.products.filter((p) => p.shopId === 's_nkechi')[3].id, qty: 2 }], fulfilment: 'MERCHANT_DELIVERY', address: 'Maitama District, Abuja', lat: 9.0867, lng: 7.4934, status: 'PLACED', ageMin: 2 });
  makeOrder({ customerId: 'c_ibrahim', shopId: 's_nkechi', items: [{ productId: d.products.filter((p) => p.shopId === 's_nkechi')[2].id, qty: 2 }], fulfilment: 'PICKUP', collector: { name: 'Ibrahim Sani', phone: '08030001111' }, status: 'PLACED', ageMin: 1 });
  const g1 = makeOrder({ customerId: 'c_ngozi', shopId: 's_greenbasket', items: [{ productId: d.products.find((p) => p.shopId === 's_greenbasket')!.id, qty: 1 }], fulfilment: 'ORBIT_COURIER', address: 'Utako Market, Abuja', lat: 9.0661, lng: 7.4417, status: 'READY', ageMin: 12 });
  Object.assign(g1, { confirmedAt: ago(10), readyAt: ago(2), prepMinutes: 10 });
  const g2 = makeOrder({ customerId: 'c_funmi', shopId: 's_techhub', items: [{ productId: d.products.find((p) => p.shopId === 's_techhub')!.id, qty: 1 }], fulfilment: 'ORBIT_COURIER', address: 'Garki Area 11, Abuja', lat: 9.0252, lng: 7.4944, status: 'READY', ageMin: 15 });
  Object.assign(g2, { confirmedAt: ago(12), readyAt: ago(3), prepMinutes: 10 });

  const past = (c: string, drv: string, vt: string, a: number, b: number, ageH: number, status = 'COMPLETED', kind: 'RIDE' | 'PARCEL' = 'RIDE') => {
    const t = makeTrip({ kind, pickup: { address: PLACES[a].label, lat: PLACES[a].lat, lng: PLACES[a].lng }, drop: { address: PLACES[b].label, lat: PLACES[b].lat, lng: PLACES[b].lng }, vehicleType: vt, method: 'CASH', customerId: c, driverId: drv, status, createdMs: nowMs() - ageH * 3600_000, goodsType: kind === 'PARCEL' ? 'DOCUMENTS' : null, weightKg: kind === 'PARCEL' ? 1 : null });
    const base = t.createdMs;
    Object.assign(t, { acceptedMs: base + 60_000, arrivedMs: base + 240_000, startedMs: base + 300_000, completedMs: base + 300_000 + t.durationS * 1000, paid: true });
    if (status === 'CANCELLED') Object.assign(t, { cancelledMs: base + 90_000, cancelledBy: 'CUSTOMER', cancelReason: 'Changed my mind', paid: false });
    if (status === 'COMPLETED') t.ratings = { byCustomer: { stars: 5, comment: 'Smooth ride' } };
    return t;
  };
  past('u_cust', 'd_moto', 'MOTORCYCLE', 0, 1, 26);
  past('u_cust', 'd_car', 'CAR', 4, 3, 50);
  past('u_cust', 'd_keke', 'KEKE', 6, 0, 70, 'CANCELLED');
  past('c_ngozi', 'd_car', 'CAR', 5, 2, 5);
  past('c_ibrahim', 'd_moto', 'MOTORCYCLE', 7, 6, 3, 'COMPLETED', 'PARCEL');
  const sosTrip = past('c_funmi', 'd_car', 'CAR', 1, 7, 0.6);
  d.sos.push({ id: uid('sos'), status: 'OPEN', raisedBy: 'CUSTOMER', note: 'Driver is taking a different route and not answering.', lat: 9.0725, lng: 7.4264, at: ago(25), resolvedAt: null, userId: 'c_funmi', tripId: sosTrip.id });
  const wel = (userId: string, title: string, body: string) => d.notifs.push({ id: uid('n'), userId, type: 'welcome', title, body, data: {}, read: false, createdAt: ago(3) });
  wel('u_cust', 'Welcome to the ORBIT demo', 'Book a ride, send a parcel or order from a shop. Everything here is simulated.');
  wel('u_merch', 'New orders are waiting', 'Two customers have placed orders at your shop. Accept them to start preparing.');
  wel('u_rider', 'Go online to get jobs', 'Switch online on the Drive tab. Ride offers and delivery jobs will appear.');
  wel('u_haul', 'Go online for freight jobs', 'Heavy-goods requests appear here when you are online.');
  wel('u_admin', 'Verification queue', 'A shop and a driver are waiting for approval. There is also an open safety alert.');
  db = keep;
}

// ---- router --------------------------------------------------------------------------------------------
interface Ctx { u: Row | null; p: Record<string, string>; q: Record<string, string>; b: Row; form?: FormData }
type Handler = (c: Ctx) => unknown;
const routes: Array<{ m: string; re: RegExp; keys: string[]; h: Handler }> = [];
function R(m: string, path: string, h: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_s, k: string) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ m, re, keys, h });
}
const need = (c: Ctx): Row => {
  if (!c.u) throw E(401, 'Please sign in.');
  return c.u;
};
const OK = { ok: true };
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const page = (items: Row[], q: Record<string, string>) => new Paged(items.slice(num(q.offset), num(q.offset) + num(q.limit, 50)), items.length);
const orderOf = (id: string) => byId(db.orders, id) ?? (() => { throw E(404, 'We could not find that order.'); })();
const tripOf = (id: string) => byId(db.trips, id) ?? (() => { throw E(404, 'We could not find that trip.'); })();
const shopOfMerchant = (u: Row) => byId(db.shops, u.shopId) ?? (() => { throw E(404, 'You do not have a shop yet.'); })();
const pointOf = (p: Row): Row => ({ address: String(p?.address ?? placeFor(p?.lat, p?.lng)), lat: num(p?.lat), lng: num(p?.lng) });
const emit = (...e: string[]) => e.forEach((x) => bus.emit(x));

// ---- public ----
R('GET', '/config', () => ({
  serviceArea: 'Nigeria', defaultMarket: 'NG', currency: 'NGN',
  markets: [{ code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', dialCode: '+234', locale: 'en-NG', center: { lat: 9.0765, lng: 7.3986 }, centerName: 'Abuja', orbitDeliveryFee: ORBIT_FEE }],
  commissionPct: 8, tripCommissionPct: 10, paymentProvider: 'mock', testMode: true, categories: CATEGORIES, legal: { version: 'demo', consentRequired: false }, pendingPaymentTtlMin: 15,
  map: { provider: 'osm', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', center: { lat: 9.0765, lng: 7.3986 }, attribution: '© OpenStreetMap contributors' },
  vehicles: VEHICLES.map(({ type, label, blurb, fleet, passengers, maxWeightKg }) => ({ type, label, blurb, fleet, passengers, maxWeightKg })), goods: GOODS,
  demo: { password: 'demo', accounts: [{ label: 'Customer', email: 'student@orbit.demo', role: 'CUSTOMER' }, { label: 'Shop owner', email: 'nkechi@orbit.demo', role: 'MERCHANT' }, { label: 'Driver (motorbike)', email: 'rider1@orbit.demo', role: 'RIDER' }, { label: 'Haulier (truck)', email: 'haulier@orbit.demo', role: 'RIDER' }, { label: 'Admin', email: 'admin@orbit.demo', role: 'ADMIN' }] },
}));
R('GET', '/legal', () => ({ version: 'demo', terms: 'This is a demonstration build of ORBIT. Nothing you do here is real: no money moves and no one is notified.', privacy: 'In demo mode all data stays on this device. Use Reset demo in Account to erase it.' }));

// ---- account ----
const tokenFor = (u: Row) => `demo:${u.id}`;
R('POST', '/auth/login', (c) => {
  const email = String(c.b.email ?? '').trim().toLowerCase();
  const u = db.users.find((x) => x.email.toLowerCase() === email && x.status !== 'DELETED');
  if (!u) throw E(401, 'Email or password is wrong. In the demo, use one of the demo accounts.');
  if (u.status === 'SUSPENDED') throw E(403, 'This account is suspended.');
  return { token: tokenFor(u), user: userView(u) };
});
R('POST', '/auth/register', (c) => {
  const b = c.b;
  const email = String(b.email ?? '').trim();
  if (db.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw E(409, 'That email is already registered.');
  const u: Row = { id: uid('u'), name: String(b.name), email, phone: String(b.phone), role: b.role, status: 'ACTIVE', vehicle: b.vehicle ?? null, fleet: b.vehicle ? (['VAN', 'TRUCK', 'LORRY', 'LONG_HAUL'].includes(b.vehicle) ? 'HEAVY' : 'LIGHT') : null, online: false, avatarUrl: null, isSuperAdmin: false, shopId: null, loginable: true, createdAt: iso() };
  if (b.role === 'MERCHANT') {
    const s: Row = { id: uid('s'), name: b.shopName || `${b.name}'s shop`, description: '', category: b.shopCategory || 'Food', address: b.shopAddress || '', color: '#3a5bd9', isOpen: true, prepMinutes: 15, offersDelivery: true, deliveryFee: 500, rating: null, ratingCount: 0, status: 'APPROVED', country: 'NG', currency: 'NGN', city: 'Abuja', state: 'FCT', lat: 9.0765, lng: 7.3986, logoUrl: null, coverUrl: null, phone: b.phone, openingHours: '', ownerId: u.id };
    db.shops.push(s);
    u.shopId = s.id;
  }
  if (b.role === 'RIDER' && b.vehicle) db.vehicles.push({ id: uid('v'), ownerId: u.id, type: b.vehicle, fleet: u.fleet, label: vehicleInfo(b.vehicle).label, make: null, model: b.vehicleModel ?? null, color: b.vehicleColor ?? null, plate: b.plate ?? null, year: null, capacityKg: vehicleInfo(b.vehicle).maxWeightKg, photos: [], status: 'APPROVED', reviewNote: null, isActive: true });
  db.users.push(u);
  return { token: tokenFor(u), user: userView(u) };
});
R('POST', '/auth/forgot-password', () => OK);
R('POST', '/auth/reset-password', () => OK);
R('GET', '/me', (c) => userView(need(c)));
R('PATCH', '/me', (c) => { const u = need(c); for (const k of ['name', 'phone', 'avatarUrl']) if (k in c.b) u[k] = c.b[k]; emit('account.updated'); return userView(u); });
R('POST', '/me/password', () => OK);
R('GET', '/me/export', (c) => ({ exportedAt: iso(), note: 'Demo data only.', user: userView(need(c)), orders: db.orders.filter((o) => o.customerId === c.u!.id).length, trips: db.trips.filter((t) => t.customerId === c.u!.id).length }));
R('POST', '/me/delete', (c) => { need(c).status = 'DELETED'; return OK; });

// ---- uploads (kept as data URLs so they survive a reload) ----
const readFile = (f: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(''); r.readAsDataURL(f); });
R('POST', '/uploads', async (c) => { const url = c.form ? await readFile(c.form.get('file') as Blob) : ''; return { url, thumb: url, width: 0, height: 0 }; });
R('POST', '/documents', (c) => { const u = need(c); const f = c.form?.get('file') as Blob | null; const d: Row = { id: uid('doc'), ownerId: u.id, kind: c.q.kind, status: 'PENDING', note: null, mime: f?.type || 'image/jpeg', createdAt: iso() }; db.docs.push(d); return d; });
R('GET', '/documents', (c) => db.docs.filter((d) => d.ownerId === need(c).id));
R('DELETE', '/documents/:id', (c) => { db.docs = db.docs.filter((d) => d.id !== c.p.id); return OK; });

// ---- maps ----
R('GET', '/geo/route', (c) => { const r = routeBetween({ lat: num(c.q.fromLat), lng: num(c.q.fromLng) }, { lat: num(c.q.toLat), lng: num(c.q.toLng) }); return { ...r, steps: [{ instruction: 'Head towards your destination', distanceM: r.distanceM, durationS: r.durationS }] }; });
R('GET', '/geo/search', (c) => { const q = (c.q.q ?? '').toLowerCase(); return { online: true, results: PLACES.filter((p) => !q || p.label.toLowerCase().includes(q)).slice(0, 8).map((p) => ({ ...p, country: 'Nigeria' })) }; });
R('GET', '/geo/reverse', (c) => ({ address: placeFor(num(c.q.lat), num(c.q.lng)) }));
R('GET', '/places', (c) => db.places.filter((p) => p.ownerId === need(c).id));
R('POST', '/places', (c) => { const p = { id: uid('pl'), ownerId: need(c).id, label: c.b.label, address: c.b.address, lat: c.b.lat, lng: c.b.lng }; db.places.push(p); return p; });
R('DELETE', '/places/:id', (c) => { db.places = db.places.filter((p) => p.id !== c.p.id); return OK; });
R('PUT', '/rider/location', () => OK);

// ---- shopping ----
R('GET', '/shops/cities', () => { const m = new Map<string, Row>(); for (const s of db.shops.filter((x) => x.status === 'APPROVED')) { const e = m.get(s.city) ?? { city: s.city, state: s.state, country: 'NG', count: 0 }; e.count++; m.set(s.city, e); } return [...m.values()]; });
R('GET', '/shops', (c) => {
  const q = c.q;
  const near = q.lat ? { lat: num(q.lat), lng: num(q.lng) } : undefined;
  let rows = db.shops.filter((s) => s.status === 'APPROVED');
  if (q.q) rows = rows.filter((s) => (s.name + s.description + s.category).toLowerCase().includes(q.q.toLowerCase()));
  if (q.category) rows = rows.filter((s) => s.category === q.category);
  if (q.city) rows = rows.filter((s) => s.city.toLowerCase() === q.city.toLowerCase());
  if (q.openNow === 'true') rows = rows.filter((s) => s.isOpen);
  const views = rows.map((s) => shopView(s, near));
  if (q.sort === 'distance' && near) views.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  else if (q.sort === 'name') views.sort((a, b) => a.name.localeCompare(b.name));
  else views.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return page(views, q);
});
R('GET', '/shops/:id', (c) => { const s = byId(db.shops, c.p.id); if (!s) throw E(404, 'We could not find that shop.'); return { shop: shopView(s), products: db.products.filter((p) => p.shopId === s.id && p.available).map(productView) }; });
R('GET', '/favourites/ids', (c) => db.favs[need(c).id] ?? []);
R('GET', '/favourites', (c) => (db.favs[need(c).id] ?? []).map((id) => byId(db.shops, id)).filter(Boolean).map((s) => shopView(s!)));
R('PUT', '/favourites/:id', (c) => { const l = (db.favs[need(c).id] ??= []); if (!l.includes(c.p.id)) l.push(c.p.id); return OK; });
R('DELETE', '/favourites/:id', (c) => { db.favs[need(c).id] = (db.favs[need(c).id] ?? []).filter((x) => x !== c.p.id); return OK; });

R('POST', '/orders', (c) => {
  const u = need(c);
  const b = c.b;
  const shop = byId(db.shops, b.shopId);
  if (shop && !shop.isOpen) throw E(409, `${shop.name} is closed right now.`);
  if (b.fulfilment === 'MERCHANT_DELIVERY' && shop && !shop.offersDelivery) throw E(400, 'This shop does not deliver. Pick ORBIT delivery or pickup.');
  if (b.fulfilment !== 'PICKUP' && !b.deliveryAddress) throw E(400, 'Enter a delivery address.');
  const o = makeOrder({ customerId: u.id, shopId: b.shopId, items: b.items, fulfilment: b.fulfilment, address: b.deliveryAddress, lat: b.deliveryLat, lng: b.deliveryLng, note: b.deliveryNote, collector: b.collectorName ? { name: b.collectorName, phone: b.collectorPhone ?? null } : null });
  return { order: orderView(o, u), payment: { reference: o.ref, amount: o.total, provider: 'mock' } };
});
R('GET', '/orders', (c) => db.orders.filter((o) => o.customerId === need(c).id).map((o) => orderView(o, c.u)));
R('GET', '/orders/:id/tracking', (c) => { const o = orderOf(c.p.id); const pos = courierPos(o); return { orderId: o.id, status: o.status, courier: pos ? { ...pos, updatedAt: iso() } : null }; });
R('GET', '/orders/:id/reorder', (c) => { const o = orderOf(c.p.id); return { shopId: o.shopId, items: o.items.map((i: Row) => ({ productId: i.productId, qty: i.qty })) }; });
R('GET', '/orders/:id', (c) => orderView(orderOf(c.p.id), need(c)));
R('POST', '/orders/:id/pay', (c) => { const o = orderOf(c.p.id); return { reference: o.ref, amount: o.total, provider: 'mock' }; });
R('POST', '/orders/:id/cancel', (c) => { const o = orderOf(c.p.id); if (['ON_THE_WAY', 'DELIVERED', 'CANCELLED'].includes(o.status)) throw E(409, 'This order can no longer be cancelled.'); Object.assign(o, { status: 'CANCELLED', cancelledBy: need(c).role, cancelReason: c.b.reason ?? null, cancelledAt: iso() }); emit('order.updated'); return orderView(o, c.u); });
R('POST', '/orders/:id/rate', (c) => { const o = orderOf(c.p.id); Object.assign(o, { rating: num(c.b.rating), review: c.b.comment ?? null }); return orderView(o, c.u); });
R('POST', '/payments/:ref/simulate', (c) => {
  const o = db.orders.find((x) => x.ref === c.p.ref);
  if (!o) throw E(404, 'We could not find that payment.');
  if (c.b.outcome === 'success' && o.status === 'PENDING_PAYMENT') {
    for (const i of o.items) { const p = byId(db.products, i.productId); if (p && p.kind === 'GOOD') p.stock = Math.max(0, p.stock - i.qty); }
    Object.assign(o, { status: 'PLACED', paidAt: iso(), paidMs: nowMs() });
    const shop = byId(db.shops, o.shopId);
    if (shop?.ownerId) notify(shop.ownerId, 'order', 'New order', `${o.no}: ${o.items.length} item(s)`, { orderId: o.id });
  } else if (c.b.outcome === 'failed') Object.assign(o, { status: 'CANCELLED', cancelledBy: 'SYSTEM', cancelReason: 'Payment failed', cancelledAt: iso() });
  emit('order.updated');
  return OK;
});
R('POST', '/payments/initialize', () => { throw E(400, 'Card checkout is simulated in demo mode. Use the test payment buttons.'); });

// ---- trips (customer) ----
function quoteOptions(kind: string, dist: number, dur: number, weight: number, passengers: number) {
  return VEHICLES.map((v) => {
    const f = fareFor(v.type, dist, dur);
    const available = kind === 'RIDE' ? ['MOTORCYCLE', 'KEKE', 'CAR'].includes(v.type) && v.passengers >= passengers : v.maxWeightKg >= weight;
    return { vehicleType: v.type, label: v.label, blurb: v.blurb, fleet: v.fleet, passengers: v.passengers, maxWeightKg: v.maxWeightKg, fare: f.fullFare, surge: f.surge, surgeAmount: f.surgeAmount, durationS: dur, etaMin: 2 + (v.label.length % 6), driversNearby: 2 + (v.label.length % 7), available };
  });
}
R('POST', '/trips/quote', (c) => {
  const a = pointOf(c.b.pickup), d = pointOf(c.b.drop);
  if (metres(a as never, d as never) < 100) throw E(400, 'Pickup and destination are too close together.');
  const r = routeBetween(a as never, d as never);
  return { kind: c.b.kind, currency: 'NGN', country: 'NG', route: { distanceM: r.distanceM, durationS: r.durationS, geometry: r.geometry, source: 'estimate' }, options: quoteOptions(c.b.kind, r.distanceM, r.durationS, num(c.b.weightKg), num(c.b.passengers, 1)) };
});
function promoFor(code: string) {
  const p = db.promos.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
  if (!p || !p.active || (p.maxUses && p.uses >= p.maxUses) || (p.validUntil && Date.parse(p.validUntil) < nowMs())) throw E(404, 'That code is not valid.');
  return p;
}
R('POST', '/trips/promo/check', (c) => { const p = promoFor(String(c.b.code)); return { code: p.code, type: p.type, value: p.value, maxDiscount: p.maxDiscount, currency: p.currency, validUntil: p.validUntil }; });
R('GET', '/trips/active', (c) => { const t = db.trips.find((x) => x.customerId === need(c).id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(x.status)); return t ? tripView(t, c.u) : { none: true }; });
R('GET', '/trips', (c) => {
  const u = need(c);
  const live = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
  const rows = db.trips.filter((t) => t.customerId === u.id && (c.q.scope === 'past' ? !live.includes(t.status) : live.includes(t.status)));
  return page(rows.map((t) => tripView(t, u)), c.q);
});
R('POST', '/trips', (c) => {
  const u = need(c);
  const b = c.b;
  if (db.trips.some((t) => t.customerId === u.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status))) throw E(409, 'You already have a trip in progress.');
  const pickup = pointOf(b.pickup), drop = pointOf(b.drop);
  const r = routeBetween(pickup as never, drop as never);
  const f = fareFor(b.vehicleType, r.distanceM, r.durationS);
  if (b.acceptedSurge !== undefined && Math.abs(Number(b.acceptedSurge) - f.surge) > 0.001) throw E(409, 'The price changed while you were booking.', { code: 'PRICE_CHANGED', current: { vehicleType: b.vehicleType, surge: f.surge, fare: f.fullFare } });
  let discount = 0, promoCode: string | null = null;
  if (b.promoCode) { const p = promoFor(b.promoCode); discount = p.type === 'PERCENT' ? Math.min(Math.round((f.fullFare * p.value) / 100), p.maxDiscount ?? 1e12) : Math.min(p.value, f.fullFare); promoCode = p.code; p.uses = (p.uses ?? 0) + 1; }
  const t = makeTrip({ kind: b.kind, pickup, drop, vehicleType: b.vehicleType, method: b.paymentMethod, customerId: u.id, passengers: b.passengers, goodsType: b.goodsType ?? null, weightKg: b.weightKg ?? null, notes: b.notes, recipient: b.recipientName ? { name: b.recipientName, phone: b.recipientPhone ?? null } : null, promoCode, discount });
  emit('trip.updated');
  return tripView(t, u);
});
R('GET', '/trips/:id', (c) => tripView(tripOf(c.p.id), need(c)));
R('GET', '/trips/:id/tracking', (c) => { const t = tripOf(c.p.id); const pos = driverPos(t); return { tripId: t.id, status: t.status, driver: pos ? { ...pos, updatedAt: iso() } : null }; });
R('POST', '/trips/:id/cancel', (c) => { const t = tripOf(c.p.id); if (!['SEARCHING', 'ACCEPTED', 'ARRIVED'].includes(t.status)) throw E(409, 'This trip can no longer be cancelled.'); Object.assign(t, { status: 'CANCELLED', cancelledMs: nowMs(), cancelledBy: 'CUSTOMER', cancelReason: c.b.reason ?? null, cancelFee: t.status === 'ARRIVED' ? 300 : 0 }); db.offers = db.offers.filter((o) => o.tripId !== t.id); emit('trip.updated', 'offers.changed'); return tripView(t, need(c)); });
R('POST', '/trips/:id/rate', (c) => { const t = tripOf(c.p.id); const u = need(c); (t.ratings ??= {})[u.id === t.driverId ? 'byDriver' : 'byCustomer'] = { stars: num(c.b.rating), comment: c.b.comment ?? null }; return tripView(t, u); });
R('POST', '/trips/:id/tip', (c) => { const t = tripOf(c.p.id); t.tip += num(c.b.amount); return tripView(t, need(c)); });
R('POST', '/trips/:id/share', (c) => { const t = tripOf(c.p.id); t.shareToken ??= uid('share'); return { token: t.shareToken, url: `${location.origin}/track/${t.shareToken}`, expiresAt: iso(nowMs() + 864e5) }; });
R('DELETE', '/trips/:id/share', (c) => { tripOf(c.p.id).shareToken = null; return OK; });
R('POST', '/trips/:id/sos', (c) => { const u = need(c); const t = tripOf(c.p.id); db.sos.unshift({ id: uid('sos'), status: 'OPEN', raisedBy: u.role === 'RIDER' ? 'DRIVER' : 'CUSTOMER', note: c.b.note ?? null, lat: c.b.lat ?? null, lng: c.b.lng ?? null, at: iso(), resolvedAt: null, userId: u.id, tripId: t.id }); for (const a of db.users.filter((x) => x.role === 'ADMIN')) notify(a.id, 'sos', 'SOS alert', `${u.name} raised an alert on trip ${t.code}.`, { tripId: t.id }); emit('admin.changed'); return OK; });
R('GET', '/track/:token', (c) => { const t = db.trips.find((x) => x.shareToken === c.p.token); if (!t) throw E(404, 'This tracking link has expired.'); const d = user(t.driverId); const pos = driverPos(t); return { code: t.code, kind: t.kind, status: t.status, driver: d ? { firstName: d.name.split(' ')[0], rating: 4.7 } : null, pickup: t.pickup, drop: t.drop, geometry: t.geometry, position: pos }; });

// ---- merchant ----
R('GET', '/merchant/shop', (c) => shopView(shopOfMerchant(need(c))));
R('PATCH', '/merchant/shop', (c) => { const s = shopOfMerchant(need(c)); for (const k of ['name', 'description', 'address', 'isOpen', 'prepMinutes', 'offersDelivery', 'deliveryFee', 'city', 'state', 'phone', 'openingHours', 'lat', 'lng', 'logoUrl', 'coverUrl']) if (k in c.b) s[k] = c.b[k]; return shopView(s); });
R('GET', '/merchant/products', (c) => db.products.filter((p) => p.shopId === shopOfMerchant(need(c)).id).map(productView));
R('POST', '/merchant/products', (c) => { const s = shopOfMerchant(need(c)); const p = { id: uid('p'), shopId: s.id, description: '', kind: 'GOOD', goodsType: 'GENERAL', images: [], lengthCm: null, widthCm: null, heightCm: null, weightKg: null, unitLabel: null, stock: 0, available: true, ...c.b }; db.products.push(p); return productView(p); });
R('PATCH', '/merchant/products/:id', (c) => { const p = byId(db.products, c.p.id); if (!p) throw E(404, 'We could not find that item.'); Object.assign(p, c.b); return productView(p); });
R('DELETE', '/merchant/products/:id', (c) => { db.products = db.products.filter((p) => p.id !== c.p.id); return undefined; });
R('GET', '/merchant/orders', (c) => { const s = shopOfMerchant(need(c)); return db.orders.filter((o) => o.shopId === s.id && o.status !== 'PENDING_PAYMENT').map((o) => orderView(o, c.u)); });
const mOrder = (c: Ctx) => { const o = orderOf(c.p.id); if (o.shopId !== shopOfMerchant(need(c)).id) throw E(403, 'That order belongs to another shop.'); return o; };
R('POST', '/merchant/orders/:id/accept', (c) => { const o = mOrder(c); if (o.status !== 'PLACED') throw E(409, 'This order has already been handled.'); const prep = num(c.b.prepMinutes, 15); Object.assign(o, { status: 'CONFIRMED', confirmedAt: iso(), confirmedMs: nowMs(), prepMinutes: prep, estimatedReadyAt: iso(nowMs() + prep * 60_000) }); notify(o.customerId, 'order', 'Order confirmed', `${o.no} is being prepared.`, { orderId: o.id }); emit('order.updated'); return orderView(o, c.u); });
R('POST', '/merchant/orders/:id/cancel', (c) => { const o = mOrder(c); Object.assign(o, { status: 'CANCELLED', cancelledBy: 'MERCHANT', cancelReason: c.b.reason ?? null, cancelledAt: iso() }); notify(o.customerId, 'order', 'Order cancelled', `${o.no} was cancelled by the shop.`, { orderId: o.id }); emit('order.updated'); return orderView(o, c.u); });
R('POST', '/merchant/orders/:id/ready', (c) => { const o = mOrder(c); Object.assign(o, { status: 'READY', readyAt: iso(), readyMs: nowMs() }); notify(o.customerId, 'order', o.fulfilment === 'PICKUP' ? 'Ready for pickup' : 'Order ready', `${o.no} is ready.`, { orderId: o.id }); emit('order.updated', 'jobs.changed'); return orderView(o, c.u); });
R('POST', '/merchant/orders/:id/dispatch', (c) => {
  const o = mOrder(c);
  if (o.status !== 'READY') throw E(409, 'Mark the order ready first.');
  if (c.b.riderId) {
    const link = db.shopRiders.find((l) => l.shopId === o.shopId && l.riderId === c.b.riderId && l.status === 'ACTIVE');
    if (!link) throw E(400, 'That rider is not one of your active riders.');
    Object.assign(o, { courierId: link.riderId, shopRider: true });
  } else Object.assign(o, { courierId: null, shopRider: false, fulfilment: o.fulfilment === 'PICKUP' ? 'PICKUP' : o.fulfilment === 'MERCHANT_DELIVERY' ? 'ORBIT_COURIER' : o.fulfilment });
  if (o.courierId) Object.assign(o, { status: 'ON_THE_WAY', pickedUpAt: iso(), pickedUpMs: nowMs() });
  if (o.courierId) notify(o.courierId, 'order', 'New delivery', `Deliver ${o.no} to ${o.address}.`, { orderId: o.id });
  notify(o.customerId, 'order', o.courierId ? 'On the way' : 'Finding a rider', `${o.no}`, { orderId: o.id });
  emit('order.updated', 'jobs.changed');
  return orderView(o, c.u);
});
R('POST', '/merchant/orders/:id/complete', (c) => { const o = mOrder(c); if (!/^\d{4}$/.test(String(c.b.pin ?? ''))) throw E(400, 'Enter the 4-digit PIN.'); Object.assign(o, { status: 'DELIVERED', deliveredAt: iso() }); notify(o.customerId, 'order', 'Order complete', `${o.no} was collected.`, { orderId: o.id }); emit('order.updated'); return orderView(o, c.u); });
function summary(rows: Array<{ at: number; amount: number; id: string; no: string; kind: string; tripId?: string }>, base: number[]) {
  const today = new Date().toDateString();
  const days = [...Array(7)].map((_, i) => { const d = new Date(nowMs() - (6 - i) * 864e5); const real = rows.filter((r) => new Date(r.at).toDateString() === d.toDateString()).reduce((s, r) => s + r.amount, 0); return { date: d.toISOString().slice(0, 10), amount: real + (i < 6 ? base[i] : 0) }; });
  return { total: days.reduce((s, d) => s + d.amount, 0) + rows.filter((r) => nowMs() - r.at > 6 * 864e5).reduce((s, r) => s + r.amount, 0), today: rows.filter((r) => new Date(r.at).toDateString() === today).reduce((s, r) => s + r.amount, 0), currency: 'NGN', ordersSettled: rows.filter((r) => !r.tripId).length, tripsSettled: rows.filter((r) => r.tripId).length, cashHeld: 0, last7Days: days, recent: rows.slice(0, 10).map((r) => ({ orderId: r.id, waybillNo: r.no, amount: r.amount, kind: r.kind, at: iso(r.at), source: r.tripId ? 'trip' : 'order', tripId: r.tripId ?? null })) };
}
R('GET', '/merchant/earnings', (c) => { const s = shopOfMerchant(need(c)); return summary(db.orders.filter((o) => o.shopId === s.id && o.status === 'DELIVERED').map((o) => ({ at: Date.parse(o.deliveredAt ?? o.createdAt), amount: orderMoney(o).yourEarnings, id: o.id, no: o.no, kind: 'SALE' })), [4200, 8800, 0, 12400, 6100, 9300]); });
R('GET', '/merchant/riders', (c) => { const s = shopOfMerchant(need(c)); return db.shopRiders.filter((l) => l.shopId === s.id).map((l) => { const r = user(l.riderId)!; return { id: l.id, status: l.status, riderId: r.id, name: r.name, phone: r.phone, vehicle: r.vehicle, avatarUrl: r.avatarUrl, online: !!r.online || l.status === 'ACTIVE' }; }); });
R('POST', '/merchant/riders', (c) => {
  const s = shopOfMerchant(need(c));
  const idf = String(c.b.identifier).trim().toLowerCase();
  let r = db.users.find((x) => x.role === 'RIDER' && (x.email.toLowerCase() === idf || x.phone === idf));
  if (!r) { r = { id: uid('u'), name: 'Demo Rider', email: idf.includes('@') ? idf : `${uid('r')}@orbit.demo`, phone: idf.includes('@') ? '08030000000' : idf, role: 'RIDER', status: 'ACTIVE', vehicle: 'MOTORCYCLE', fleet: 'LIGHT', online: true, avatarUrl: null, isSuperAdmin: false, shopId: null, loginable: false, createdAt: iso() }; db.users.push(r); }
  const l = { id: uid('sr'), shopId: s.id, riderId: r.id, status: 'INVITED' };
  db.shopRiders.push(l);
  notify(r.id, 'invite', 'Shop invitation', `${s.name} invited you to deliver for them.`);
  return { id: l.id, status: l.status, riderId: r.id, name: r.name };
});
R('DELETE', '/merchant/riders/:id', (c) => { db.shopRiders = db.shopRiders.filter((l) => l.id !== c.p.id); return OK; });

// ---- driver ----
const mine = (c: Ctx) => need(c).id;
R('PUT', '/rider/availability', (c) => { need(c).online = !!c.b.online; if (!c.b.online) { const ids = db.offers.filter((o) => o.driverId === c.u!.id).map((o) => o.tripId); db.trips = db.trips.filter((t) => !ids.includes(t.id)); db.offers = db.offers.filter((o) => o.driverId !== c.u!.id); } return { online: !!c.u!.online }; });
R('GET', '/rider/jobs', (c) => { need(c); return db.orders.filter((o) => o.status === 'READY' && o.fulfilment === 'ORBIT_COURIER' && !o.courierId).map((o) => orderView(o, c.u)); });
R('GET', '/rider/active', (c) => db.orders.filter((o) => o.courierId === mine(c) && ['READY', 'ON_THE_WAY'].includes(o.status)).map((o) => orderView(o, c.u)));
R('GET', '/rider/history', (c) => db.orders.filter((o) => o.courierId === mine(c) && o.status === 'DELIVERED').map((o) => orderView(o, c.u)));
R('POST', '/rider/jobs/:id/claim', (c) => { const o = orderOf(c.p.id); if (o.courierId) throw E(409, 'Another rider already took this job.'); o.courierId = mine(c); o.shopRider = false; notify(o.customerId, 'order', 'Rider assigned', `${c.u!.name} will deliver ${o.no}.`, { orderId: o.id }); emit('order.updated', 'jobs.changed'); return orderView(o, c.u); });
R('POST', '/rider/jobs/:id/release', (c) => { const o = orderOf(c.p.id); o.courierId = null; emit('jobs.changed'); return orderView(o, c.u); });
R('POST', '/rider/jobs/:id/pickup', (c) => { const o = orderOf(c.p.id); Object.assign(o, { status: 'ON_THE_WAY', pickedUpAt: iso(), pickedUpMs: nowMs() }); notify(o.customerId, 'order', 'On the way', `${o.no} has been picked up.`, { orderId: o.id }); emit('order.updated'); return orderView(o, c.u); });
R('POST', '/rider/jobs/:id/deliver', (c) => { const o = orderOf(c.p.id); if (!/^\d{4}$/.test(String(c.b.pin ?? ''))) throw E(400, 'Enter the 4-digit PIN from the customer.'); Object.assign(o, { status: 'DELIVERED', deliveredAt: iso() }); notify(o.customerId, 'order', 'Delivered', `${o.no} was delivered.`, { orderId: o.id }); emit('order.updated'); return orderView(o, c.u); });
R('GET', '/rider/earnings', (c) => { const id = mine(c); const rows = [...db.orders.filter((o) => o.courierId === id && o.status === 'DELIVERED').map((o) => ({ at: Date.parse(o.deliveredAt ?? o.createdAt), amount: orderMoney(o).payout, id: o.id, no: o.no, kind: 'DELIVERY' })), ...db.trips.filter((t) => t.driverId === id && t.status === 'COMPLETED').map((t) => ({ at: t.completedMs, amount: Math.round((t.fare.fullFare - t.discount) * 0.9) + t.tip, id: t.id, no: t.code, kind: 'TRIP', tripId: t.id }))].sort((a, b) => b.at - a.at); const s = summary(rows, [3100, 5400, 2200, 0, 7800, 4600]); s.cashHeld = db.trips.filter((t) => t.driverId === id && t.status === 'COMPLETED' && t.method === 'CASH').reduce((n, t) => n + Math.round((t.fare.fullFare - t.discount) * 0.1), 0); return s; });
const offerView = (o: Row) => { const t = tripOf(o.tripId); const cu = user(t.customerId); const gi = goodsInfo(t.goodsType); return { tripId: t.id, code: t.code, kind: t.kind, vehicleType: t.vehicleType, currency: 'NGN', secondsLeft: Math.max(0, Math.round((o.expiresMs - nowMs()) / 1000)), expiresAt: iso(o.expiresMs), distanceToPickupM: o.toPickupM, pickup: t.pickup, drop: t.drop, distanceM: t.distanceM, durationS: t.durationS, driverEarning: Math.round(t.fare.fullFare * 0.9), paymentMethod: t.method, surge: t.fare.surge, cargo: { passengers: t.passengers, goodsType: t.goodsType, goodsLabel: gi?.label ?? null, careful: !!gi?.careful, urgent: !!gi?.urgent, weightKg: t.weightKg }, customer: cu ? { firstName: cu.name.split(' ')[0], rating: ratingOf(cu) } : null }; };
R('GET', '/driver/offers', (c) => db.offers.filter((o) => o.driverId === mine(c) && o.expiresMs > nowMs()).map(offerView));
R('POST', '/driver/offers/:id/accept', (c) => { const t = tripOf(c.p.id); if (t.status !== 'SEARCHING') throw E(409, 'This request was already taken.'); Object.assign(t, { status: 'ACCEPTED', driverId: mine(c), acceptedMs: nowMs() }); db.offers = db.offers.filter((o) => o.tripId !== t.id); emit('offers.changed', 'trip.updated'); return tripView(t, c.u); });
R('POST', '/driver/offers/:id/decline', (c) => { db.offers = db.offers.filter((o) => o.tripId !== c.p.id); db.trips = db.trips.filter((t) => t.id !== c.p.id); emit('offers.changed'); return OK; });
R('GET', '/driver/trips/active', (c) => { const t = db.trips.find((x) => x.driverId === mine(c) && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(x.status)); return t ? tripView(t, c.u) : { none: true }; });
R('GET', '/driver/trips', (c) => page(db.trips.filter((t) => t.driverId === mine(c) && ['COMPLETED', 'CANCELLED'].includes(t.status)).map((t) => tripView(t, c.u)), c.q));
const dTrip = (c: Ctx) => { const t = tripOf(c.p.id); if (t.driverId !== mine(c)) throw E(403, 'This is not your trip.'); return t; };
R('POST', '/driver/trips/:id/arrived', (c) => { const t = dTrip(c); Object.assign(t, { status: 'ARRIVED', arrivedMs: nowMs() }); notify(t.customerId, 'trip', 'Your driver has arrived', 'Meet them at the pickup point.', { tripId: t.id }); emit('trip.updated'); return tripView(t, c.u); });
R('POST', '/driver/trips/:id/start', (c) => { const t = dTrip(c); if (t.kind === 'RIDE' && !/^\d{4}$/.test(String(c.b.pin ?? ''))) throw E(400, 'Ask the passenger for the 4-digit PIN.'); Object.assign(t, { status: 'IN_PROGRESS', startedMs: nowMs() }); notify(t.customerId, 'trip', 'Trip started', 'You are on your way.', { tripId: t.id }); emit('trip.updated'); return tripView(t, c.u); });
R('POST', '/driver/trips/:id/complete', (c) => { const t = dTrip(c); if (t.kind === 'PARCEL' && !/^\d{4}$/.test(String(c.b.pin ?? ''))) throw E(400, 'Ask the recipient for the 4-digit PIN.'); Object.assign(t, { status: 'COMPLETED', completedMs: nowMs(), paid: true }); notify(t.customerId, 'trip', 'Trip complete', 'Rate your driver and add a tip if you like.', { tripId: t.id }); emit('trip.updated'); return tripView(t, c.u); });
R('POST', '/driver/trips/:id/cancel', (c) => { const t = dTrip(c); Object.assign(t, { status: 'SEARCHING', driverId: null, acceptedMs: null }); notify(t.customerId, 'trip', 'Finding another driver', 'Your driver cancelled.', { tripId: t.id }); emit('trip.updated'); return tripView(t, c.u); });
const myVehicles = (c: Ctx) => db.vehicles.filter((v) => v.ownerId === mine(c));
R('GET', '/vehicles', (c) => myVehicles(c));
R('POST', '/vehicles', (c) => { const v = { id: uid('v'), ownerId: mine(c), fleet: vehicleInfo(c.b.type).fleet, label: vehicleInfo(c.b.type).label, make: null, model: null, color: null, plate: null, year: null, capacityKg: vehicleInfo(c.b.type).maxWeightKg, photos: [], status: 'PENDING', reviewNote: null, isActive: false, ...c.b }; db.vehicles.push(v); return v; });
R('PATCH', '/vehicles/:id', (c) => { const v = byId(db.vehicles, c.p.id)!; Object.assign(v, c.b); return v; });
R('POST', '/vehicles/:id/activate', (c) => { const v = byId(db.vehicles, c.p.id)!; for (const x of myVehicles(c)) x.isActive = x.id === v.id; Object.assign(c.u!, { vehicle: v.type, fleet: v.fleet }); emit('account.updated'); return v; });
R('DELETE', '/vehicles/:id', (c) => { db.vehicles = db.vehicles.filter((v) => v.id !== c.p.id); return OK; });
R('GET', '/rider/shops', (c) => db.shopRiders.filter((l) => l.riderId === mine(c)).map((l) => { const s = byId(db.shops, l.shopId)!; return { id: l.id, status: l.status, shop: { id: s.id, name: s.name, address: s.address, city: s.city } }; }));
R('POST', '/rider/shops/:id/accept', (c) => { const l = byId(db.shopRiders, c.p.id); if (l) l.status = 'ACTIVE'; return OK; });
R('DELETE', '/rider/shops/:id', (c) => { db.shopRiders = db.shopRiders.filter((l) => l.id !== c.p.id); return OK; });

// ---- notifications ----
R('GET', '/notifications/unread-count', (c) => ({ unread: db.notifs.filter((n) => n.userId === need(c).id && !n.read).length }));
R('GET', '/notifications', (c) => { let rows = db.notifs.filter((n) => n.userId === need(c).id); if (c.q.before) rows = rows.filter((n) => n.createdAt < c.q.before); return rows.slice(0, num(c.q.limit, 40)).map(({ userId: _u, ...n }) => n); }); // eslint-disable-line @typescript-eslint/no-unused-vars
R('POST', '/notifications/read', (c) => { for (const n of db.notifs) if (n.userId === need(c).id && (!c.b.ids || c.b.ids.includes(n.id))) n.read = true; return OK; });
R('DELETE', '/notifications', (c) => { db.notifs = db.notifs.filter((n) => n.userId !== need(c).id); return OK; });

// ---- admin ----
const admin = (c: Ctx) => { const u = need(c); if (u.role !== 'ADMIN') throw E(403, 'Admins only.'); return u; };
const docView = (d: Row) => ({ id: d.id, kind: d.kind, status: d.status, mime: d.mime, note: d.note });
R('GET', '/admin/queue', (c) => { admin(c); return { merchants: db.users.filter((u) => u.role === 'MERCHANT' && u.status === 'PENDING_VERIFICATION').map((u) => { const s = byId(db.shops, u.shopId); return { userId: u.id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt, shop: s ? { id: s.id, name: s.name, category: s.category, address: s.address, city: s.city } : null, documents: db.docs.filter((d) => d.ownerId === u.id).map(docView) }; }), riders: db.users.filter((u) => u.role === 'RIDER' && u.status === 'PENDING_VERIFICATION').map((u) => ({ userId: u.id, name: u.name, email: u.email, phone: u.phone, vehicle: u.vehicle, fleet: u.fleet, createdAt: u.createdAt, vehicles: db.vehicles.filter((v) => v.ownerId === u.id), documents: db.docs.filter((d) => d.ownerId === u.id).map(docView) })) }; });
R('POST', '/admin/users/:id/approve', (c) => { admin(c); const u = user(c.p.id)!; u.status = 'ACTIVE'; const s = byId(db.shops, u.shopId); if (s) { s.status = 'APPROVED'; s.isOpen = true; } for (const v of db.vehicles.filter((x) => x.ownerId === u.id)) v.status = 'APPROVED'; for (const d of db.docs.filter((x) => x.ownerId === u.id)) d.status = 'APPROVED'; notify(u.id, 'account', 'You are approved', 'Your account is verified. Welcome aboard.'); emit('admin.changed'); return OK; });
R('POST', '/admin/users/:id/suspend', (c) => { admin(c); user(c.p.id)!.status = 'SUSPENDED'; emit('admin.changed'); return OK; });
R('GET', '/admin/orders', (c) => { admin(c); return db.orders.map((o) => orderView(o, c.u)); });
R('POST', '/admin/orders/:id/unlock-pin', (c) => { admin(c); return OK; });
R('GET', '/admin/documents/user/:id', (c) => { admin(c); return db.docs.filter((d) => d.ownerId === c.p.id).map(docView); });
R('POST', '/admin/documents/:id/review', (c) => { admin(c); Object.assign(byId(db.docs, c.p.id)!, { status: c.b.status, note: c.b.note ?? null }); return OK; });
R('POST', '/admin/vehicles/:id/approve', (c) => { admin(c); const v = byId(db.vehicles, c.p.id)!; v.status = 'APPROVED'; return v; });
R('POST', '/admin/vehicles/:id/reject', (c) => { admin(c); const v = byId(db.vehicles, c.p.id)!; Object.assign(v, { status: 'REJECTED', reviewNote: c.b.note }); return v; });
R('GET', '/admin/documents/:id/file', () => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#eef0f8"/><text x="240" y="140" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#161a52">Demo document</text><text x="240" y="176" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#555">Real uploads are private to admins</text></svg>`], { type: 'image/svg+xml' }));
R('GET', '/admin/trips', (c) => { admin(c); return page(db.trips.filter((t) => !c.q.status || t.status === c.q.status).map((t) => tripView(t, c.u)), c.q); });
R('POST', '/admin/trips/:id/unlock-pin', (c) => { admin(c); return OK; });
R('POST', '/admin/trips/:id/cancel', (c) => { admin(c); const t = tripOf(c.p.id); Object.assign(t, { status: 'CANCELLED', cancelledMs: nowMs(), cancelledBy: 'ADMIN', cancelReason: c.b.reason ?? null }); db.offers = db.offers.filter((o) => o.tripId !== t.id); emit('trip.updated', 'offers.changed'); return OK; });
R('GET', '/admin/sos', (c) => { admin(c); return db.sos.filter((s) => s.status === (c.q.status ?? 'OPEN')).map((s) => { const p = user(s.userId); const t = byId(db.trips, s.tripId); return { id: s.id, status: s.status, raisedBy: s.raisedBy, note: s.note, lat: s.lat, lng: s.lng, at: s.at, resolvedAt: s.resolvedAt, person: p ? { name: p.name, phone: p.phone, role: p.role } : null, trip: t ? { id: t.id, code: t.code, status: t.status, kind: t.kind, pickup: t.pickup.address, drop: t.drop.address, vehicle: t.vehicleType } : null }; }); });
R('POST', '/admin/sos/:id/resolve', (c) => { admin(c); Object.assign(byId(db.sos, c.p.id)!, { status: 'RESOLVED', resolvedAt: iso(), resolution: c.b.note }); emit('admin.changed'); return OK; });
R('GET', '/admin/promos', (c) => { admin(c); return db.promos; });
R('POST', '/admin/promos', (c) => { admin(c); if (db.promos.some((p) => p.code === c.b.code)) throw E(409, 'That code already exists.'); const p = { id: uid('pr'), code: c.b.code, type: c.b.type, value: c.b.value, maxDiscount: c.b.maxDiscount ?? null, currency: 'NGN', validUntil: c.b.validDays ? iso(nowMs() + c.b.validDays * 864e5) : null, maxUses: c.b.maxUses ?? null, uses: 0, active: true }; db.promos.unshift(p); return p; });
R('POST', '/admin/promos/:id/activate', (c) => { admin(c); const p = byId(db.promos, c.p.id)!; p.active = true; return p; });
R('POST', '/admin/promos/:id/deactivate', (c) => { admin(c); const p = byId(db.promos, c.p.id)!; p.active = false; return p; });
const adminView = (u: Row) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED', isSuperAdmin: !!u.isSuperAdmin, mustChangePassword: !!u.mustChangePassword, createdAt: u.createdAt });
R('GET', '/admin/admins', (c) => { admin(c); const list = db.users.filter((u) => u.role === 'ADMIN' && u.status !== 'DELETED'); return { admins: list.map(adminView), limit: 6, used: list.filter((u) => !u.isSuperAdmin).length }; });
R('POST', '/admin/admins', (c) => { admin(c); if (db.users.filter((u) => u.role === 'ADMIN' && !u.isSuperAdmin && u.status !== 'DELETED').length >= 6) throw E(409, 'You have reached the limit of 6 extra admins.'); if (db.users.some((u) => u.email.toLowerCase() === String(c.b.email).toLowerCase())) throw E(409, 'That email is already registered.'); const u: Row = { id: uid('u'), name: c.b.name, email: c.b.email, phone: c.b.phone, role: 'ADMIN', status: 'ACTIVE', vehicle: null, fleet: null, online: false, avatarUrl: null, isSuperAdmin: false, mustChangePassword: true, shopId: null, loginable: true, createdAt: iso() }; db.users.push(u); return adminView(u); });
R('POST', '/admin/admins/:id/suspend', (c) => { admin(c); user(c.p.id)!.status = 'SUSPENDED'; return OK; });
R('POST', '/admin/admins/:id/reactivate', (c) => { admin(c); user(c.p.id)!.status = 'ACTIVE'; return OK; });
R('POST', '/admin/admins/:id/reset-password', (c) => { admin(c); user(c.p.id)!.mustChangePassword = true; return OK; });
R('DELETE', '/admin/admins/:id', (c) => { admin(c); user(c.p.id)!.status = 'DELETED'; return OK; });
R('GET', '/admin/kpis', (c) => {
  admin(c);
  const done = db.orders.filter((o) => o.status === 'DELIVERED');
  const trips = db.trips.filter((t) => t.status === 'COMPLETED');
  const gmv = done.reduce((s, o) => s + o.subtotal, 0);
  const tgmv = trips.reduce((s, t) => s + t.fare.fullFare - t.discount, 0);
  return {
    generatedAt: iso(), currency: 'NGN', currencies: ['NGN'],
    marketplace: { activeMerchants: db.shops.filter((s) => s.status === 'APPROVED').length, listedProducts: db.products.length, completedOrders: done.length, gmv, averageBasket: done.length ? Math.round(gmv / done.length) : null, repeatPurchaseRatePct: 38, refundRatePct: 2, openOrders: db.orders.filter((o) => ['PLACED', 'CONFIRMED', 'READY', 'ON_THE_WAY'].includes(o.status)).length },
    logistics: { courierDeliveries: done.filter((o) => o.courierId).length, averageDeliveryMinutes: 24, orderCompletionRatePct: 93, activeRiders: db.users.filter((u) => u.role === 'RIDER' && u.status === 'ACTIVE').length, onlineRiders: db.users.filter((u) => u.role === 'RIDER' && u.online).length },
    financial: { platformRevenue: Math.round(gmv * 0.08 + tgmv * 0.1), commission: Math.round(gmv * 0.08), deliveryContribution: done.length * 300, contributionPerOrder: done.length ? 420 : null, owedToMerchants: Math.round(gmv * 0.92), owedToRiders: done.length * ORBIT_PAYOUT },
    mobility: { completedTrips: trips.length, rides: trips.filter((t) => t.kind === 'RIDE').length, parcels: trips.filter((t) => t.kind === 'PARCEL').length, gmv: tgmv, averageFare: trips.length ? Math.round(tgmv / trips.length) : null, completionRatePct: 91, searchingNow: db.trips.filter((t) => t.status === 'SEARCHING').length, onTheRoadNow: db.trips.filter((t) => t.status === 'IN_PROGRESS').length, averageDriverRating: 4.7, openSafetyAlerts: db.sos.filter((s) => s.status === 'OPEN').length, platformRevenue: Math.round(tgmv * 0.1), owedToDrivers: Math.round(tgmv * 0.9), cashCommissionDue: Math.round(tgmv * 0.04) },
    verificationQueue: { pendingMerchants: db.users.filter((u) => u.role === 'MERCHANT' && u.status === 'PENDING_VERIFICATION').length, pendingRiders: db.users.filter((u) => u.role === 'RIDER' && u.status === 'PENDING_VERIFICATION').length },
  };
});

// ---- simulated people ----------------------------------------------------------------------------------
function courierPos(o: Row) {
  if (o.status !== 'ON_THE_WAY') return null;
  const shop = byId(db.shops, o.shopId);
  if (!shop || o.lat == null) return null;
  const p = along(curve({ lat: shop.lat, lng: shop.lng }, { lat: o.lat, lng: o.lng }), (nowMs() - (o.pickedUpMs ?? nowMs())) / 24_000);
  return { lat: p.lat, lng: p.lng, heading: p.heading };
}
function driverPos(t: Row) {
  if (t.status === 'ACCEPTED' || t.status === 'ARRIVED') {
    const start = { lat: t.pickup.lat + 0.012, lng: t.pickup.lng - 0.01 };
    const p = along(curve(start, t.pickup), t.status === 'ARRIVED' ? 1 : (nowMs() - t.acceptedMs) / 12_000);
    return { lat: p.lat, lng: p.lng, heading: p.heading };
  }
  if (t.status === 'IN_PROGRESS') {
    const p = along(t.geometry, (nowMs() - t.startedMs) / 28_000);
    return { lat: p.lat, lng: p.lng, heading: p.heading };
  }
  return null;
}

let lastOffer = 0;
function tick() {
  const t0 = nowMs();
  let changed = false;
  const role = viewer?.role;
  const stage = (humanTurn: boolean, since: number | undefined, ms: number) => !humanTurn && t0 - (since ?? t0) > ms;

  for (const o of db.orders) {
    const mineShop = role === 'MERCHANT' && viewer?.shopId === o.shopId;
    const set = (patch: Row, title: string, body: string, ev = 'order.updated') => { Object.assign(o, patch); notify(o.customerId, 'order', title, body, { orderId: o.id }); emit(ev, 'jobs.changed'); changed = true; };
    if (o.status === 'PLACED' && stage(mineShop, o.paidMs, 5000)) set({ status: 'CONFIRMED', confirmedAt: iso(), confirmedMs: t0, prepMinutes: 10, estimatedReadyAt: iso(t0 + 600_000) }, 'Order confirmed', `${o.no} is being prepared.`);
    else if (o.status === 'CONFIRMED' && stage(mineShop, o.confirmedMs, 8000)) set({ status: 'READY', readyAt: iso(), readyMs: t0 }, o.fulfilment === 'PICKUP' ? 'Ready for pickup' : 'Order ready', `${o.no} is ready.`);
    else if (o.status === 'READY' && o.fulfilment === 'PICKUP' && stage(mineShop, o.readyMs, 14000)) set({ status: 'DELIVERED', deliveredAt: iso() }, 'Order complete', `${o.no} was collected.`);
    else if (o.status === 'READY' && o.fulfilment === 'MERCHANT_DELIVERY' && stage(mineShop, o.readyMs, 6000)) set({ status: 'ON_THE_WAY', courierId: 'd_moto', shopRider: true, pickedUpAt: iso(), pickedUpMs: t0 }, 'On the way', `${o.no} has been picked up.`);
    else if (o.status === 'READY' && o.fulfilment === 'ORBIT_COURIER' && !o.courierId && stage(role === 'RIDER', o.readyMs ?? o.createdMs, 7000) && o.customerId === viewer?.id) set({ status: 'ON_THE_WAY', courierId: 'd_keke', shopRider: false, pickedUpAt: iso(), pickedUpMs: t0 }, 'On the way', `An ORBIT rider picked up ${o.no}.`);
    else if (o.status === 'ON_THE_WAY') {
      const mineCourier = role === 'RIDER' && viewer?.id === o.courierId;
      if (stage(mineCourier || (role === 'MERCHANT' && o.shopRider && false), o.pickedUpMs, 24000) && !mineCourier) set({ status: 'DELIVERED', deliveredAt: iso() }, 'Delivered', `${o.no} was delivered. Enjoy!`);
      else { const p = courierPos(o); if (p) bus.courier({ orderId: o.id, ...p }); }
    }
  }

  for (const tr of db.trips) {
    const rider = role === 'RIDER' && viewer?.id === tr.driverId;
    const set = (patch: Row, title: string, body: string) => { Object.assign(tr, patch); notify(tr.customerId, 'trip', title, body, { tripId: tr.id }); emit('trip.updated'); changed = true; };
    if (tr.status === 'SEARCHING' && !tr.demoOffer && t0 - tr.createdMs > 4500) {
      const d = user(DRIVER_FOR[tr.vehicleType]);
      set({ status: 'ACCEPTED', driverId: d?.id, acceptedMs: t0 }, 'Driver on the way', `${d?.name.split(' ')[0]} accepted your ${tr.kind === 'RIDE' ? 'ride' : 'delivery'}.`);
    } else if (tr.status === 'ACCEPTED' && !rider && t0 - tr.acceptedMs > 12000) set({ status: 'ARRIVED', arrivedMs: t0 }, 'Your driver has arrived', 'Meet them at the pickup point.');
    else if (tr.status === 'ARRIVED' && !rider && t0 - tr.arrivedMs > 7000) set({ status: 'IN_PROGRESS', startedMs: t0 }, 'Trip started', 'You are on your way.');
    else if (tr.status === 'IN_PROGRESS' && !rider && t0 - tr.startedMs > 28000) set({ status: 'COMPLETED', completedMs: t0, paid: true }, 'Trip complete', 'Rate your driver and add a tip if you like.');
    const p = ['ACCEPTED', 'IN_PROGRESS'].includes(tr.status) ? driverPos(tr) : null;
    if (p) bus.courier({ tripId: tr.id, ...p });
  }

  // Expire offers nobody answered.
  const dead = db.offers.filter((o) => o.expiresMs < t0);
  if (dead.length) { const ids = dead.map((o) => o.tripId); db.offers = db.offers.filter((o) => o.expiresMs >= t0); db.trips = db.trips.filter((t) => !(ids.includes(t.id) && t.status === 'SEARCHING')); emit('offers.changed'); changed = true; }

  // A signed-in driver who is online gets simulated requests.
  if (role === 'RIDER' && viewer?.online && t0 - lastOffer > 9000 && !db.offers.some((o) => o.driverId === viewer!.id) && !db.trips.some((t) => t.driverId === viewer!.id && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(t.status))) {
    lastOffer = t0;
    const abuja = PLACES.slice(0, 8);
    const a = abuja[Math.floor(Math.random() * abuja.length)];
    let b = abuja[Math.floor(Math.random() * abuja.length)];
    if (b === a) b = abuja[(abuja.indexOf(a) + 3) % abuja.length];
    const heavy = viewer.fleet === 'HEAVY';
    const cust = ['c_ngozi', 'c_ibrahim', 'c_funmi'][Math.floor(Math.random() * 3)];
    const trip = makeTrip({ kind: heavy || viewer.vehicle === 'BICYCLE' ? 'PARCEL' : 'RIDE', pickup: { address: a.label, lat: a.lat, lng: a.lng }, drop: { address: b.label, lat: b.lat, lng: b.lng }, vehicleType: viewer.vehicle, method: Math.random() < 0.5 ? 'CASH' : 'CARD', customerId: cust, goodsType: heavy ? 'BUILDING' : null, weightKg: heavy ? 1200 : null, demoOffer: true, passengers: 1 });
    db.offers.push({ id: uid('of'), tripId: trip.id, driverId: viewer.id, expiresMs: t0 + 25_000, toPickupM: 700 + Math.floor(Math.random() * 1800) });
    notify(viewer.id, 'offer', 'New request', `${a.label.split(',')[0]} → ${b.label.split(',')[0]}`, { tripId: trip.id });
    emit('offers.changed');
    changed = true;
  }
  if (changed) save();
}

// ---- entry point ---------------------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoSend(method: string, fullPath: string, body: unknown, form?: FormData): Promise<Response> {
  if (!started) {
    db = load();
    tripNo = Math.max(tripNo, 4200 + db.trips.length + 1);
    orderNo = Math.max(orderNo, 1700 + db.orders.length + 1);
    started = true;
    setInterval(tick, 1500);
  }
  const [path, query = ''] = fullPath.split('?');
  const q = Object.fromEntries(new URLSearchParams(query));
  let token: string | null = null;
  try { token = localStorage.getItem('orbit.token'); } catch { /* none */ }
  const u = token?.startsWith('demo:') ? (user(token.slice(5)) ?? null) : null;
  if (u && u.status !== 'DELETED') viewer = u; else viewer = null;
  await sleep(90 + Math.random() * 160);
  for (const r of routes) {
    if (r.m !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const p: Record<string, string> = {};
    r.keys.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])));
    try {
      const out = await r.h({ u: viewer, p, q, b: (body ?? {}) as Row, form });
      save();
      if (out instanceof Blob) return new Response(out, { status: 200, headers: { 'Content-Type': out.type } });
      if (out instanceof Paged) return new Response(JSON.stringify(out.items), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(out.total) } });
      if (out === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (e instanceof DemoError) return new Response(JSON.stringify({ message: e.message, ...e.body }), { status: e.status, headers: { 'Content-Type': 'application/json' } });
      console.error('[demo]', method, path, e);
      return new Response(JSON.stringify({ message: 'The demo could not do that.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ message: 'This action is not available in the demo.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
