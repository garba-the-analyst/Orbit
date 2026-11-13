/** Seed data and small helpers for the demo backend. Everything here is fictional. */
import { SHOP_CATEGORIES } from '../types';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Db {
  v: number;
  seq: number;
  users: Row[];
  shops: Row[];
  products: Row[];
  orders: Row[];
  trips: Row[];
  offers: Row[];
  notifs: Row[];
  sos: Row[];
  promos: Row[];
  vehicles: Row[];
  docs: Row[];
  shopRiders: Row[];
  favs: Record<string, string[]>;
  places: Row[];
}

export const DB_VERSION = 3;
export const nowMs = () => Date.now();
export const iso = (ms: number = Date.now()) => new Date(ms).toISOString();
export const ago = (min: number) => iso(Date.now() - min * 60_000);
let counter = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A gently curved line from a to b as [lat, lng] points, standing in for a road route. */
export function curve(a: { lat: number; lng: number }, b: { lat: number; lng: number }, n = 30): Array<[number, number]> {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * 0.12;
    out.push([a.lat + dLat * t - dLng * bend, a.lng + dLng * t + dLat * bend]);
  }
  return out;
}

export function along(geometry: Array<[number, number]>, t: number): { lat: number; lng: number; heading: number } {
  const x = Math.min(Math.max(t, 0), 1) * (geometry.length - 1);
  const i = Math.min(Math.floor(x), geometry.length - 2);
  const f = x - i;
  const [a, b] = [geometry[i], geometry[i + 1]];
  const heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading: (90 - heading + 360) % 360 };
}

export const PLACES = [
  { label: 'Wuse Market, Wuse, Abuja', lat: 9.0702, lng: 7.4811, city: 'Abuja', state: 'FCT' },
  { label: 'Jabi Lake Mall, Jabi, Abuja', lat: 9.0725, lng: 7.4264, city: 'Abuja', state: 'FCT' },
  { label: 'Abuja National Stadium, Abuja', lat: 9.0536, lng: 7.4372, city: 'Abuja', state: 'FCT' },
  { label: 'Nnamdi Azikiwe Airport, Abuja', lat: 9.0068, lng: 7.2632, city: 'Abuja', state: 'FCT' },
  { label: 'Gwarinpa Estate, Abuja', lat: 9.1108, lng: 7.4042, city: 'Abuja', state: 'FCT' },
  { label: 'Maitama District, Abuja', lat: 9.0867, lng: 7.4934, city: 'Abuja', state: 'FCT' },
  { label: 'Garki Area 11, Abuja', lat: 9.0252, lng: 7.4944, city: 'Abuja', state: 'FCT' },
  { label: 'Utako Market, Abuja', lat: 9.0661, lng: 7.4417, city: 'Abuja', state: 'FCT' },
  { label: 'Ikeja City Mall, Ikeja, Lagos', lat: 6.6137, lng: 3.3556, city: 'Lagos', state: 'Lagos' },
  { label: 'Victoria Island, Lagos', lat: 6.4281, lng: 3.4219, city: 'Lagos', state: 'Lagos' },
  { label: 'Lekki Phase 1, Lagos', lat: 6.4474, lng: 3.4723, city: 'Lagos', state: 'Lagos' },
  { label: 'Kano Central Market, Kano', lat: 12.0003, lng: 8.5167, city: 'Kano', state: 'Kano' },
  { label: 'GRA Phase 2, Port Harcourt', lat: 4.8156, lng: 7.0498, city: 'Port Harcourt', state: 'Rivers' },
  { label: 'Bosso, Minna, Niger', lat: 9.6139, lng: 6.5569, city: 'Minna', state: 'Niger' },
  { label: 'Ring Road, Ibadan, Oyo', lat: 7.3775, lng: 3.947, city: 'Ibadan', state: 'Oyo' },
];

const SHOPS: Array<{ id: string; name: string; cat: string; color: string; city: string; state: string; lat: number; lng: number; address: string; desc: string; items: Array<[string, number, string, string]> }> = [
  { id: 's_nkechi', name: 'Nkechi’s Kitchen', cat: 'Food', color: '#e07a1f', city: 'Abuja', state: 'FCT', lat: 9.0702, lng: 7.4811, address: '14 Adetokunbo Ademola Crescent, Wuse 2', desc: 'Home-style Nigerian meals, cooked fresh every morning.', items: [['Jollof rice and chicken', 3500, 'FOOD', 'plate'], ['Egusi soup with pounded yam', 4200, 'FOOD', 'plate'], ['Suya (large)', 2500, 'FOOD', 'portion'], ['Zobo drink (1L)', 1200, 'PERISHABLE', 'bottle'], ['Puff-puff (10 pieces)', 1000, 'FOOD', 'pack']] },
  { id: 's_greenbasket', name: 'Green Basket Groceries', cat: 'Groceries', color: '#2e8b57', city: 'Abuja', state: 'FCT', lat: 9.0867, lng: 7.4934, address: '5 Gana Street, Maitama', desc: 'Fresh vegetables, fruit and pantry staples.', items: [['Tomatoes (basket)', 3000, 'PERISHABLE', 'basket'], ['Rice 5kg bag', 9500, 'GENERAL', 'bag'], ['Eggs (crate of 30)', 4800, 'FRAGILE', 'crate'], ['Plantain (bunch)', 2200, 'PERISHABLE', 'bunch']] },
  { id: 's_techhub', name: 'TechHub Gadgets', cat: 'Gadgets', color: '#3a5bd9', city: 'Abuja', state: 'FCT', lat: 9.0725, lng: 7.4264, address: 'Shop 12, Jabi Lake Mall', desc: 'Phones, chargers and accessories with warranty.', items: [['Fast charger 33W', 6500, 'ELECTRONICS', 'piece'], ['Wireless earbuds', 18500, 'ELECTRONICS', 'piece'], ['Phone case', 2500, 'GENERAL', 'piece'], ['Power bank 20,000mAh', 14000, 'ELECTRONICS', 'piece']] },
  { id: 's_lagoschop', name: 'Lagos Chop House', cat: 'Food', color: '#c2185b', city: 'Lagos', state: 'Lagos', lat: 6.4281, lng: 3.4219, address: '22 Adeola Odeku Street, Victoria Island', desc: 'Small chops, grills and cocktails.', items: [['Asun platter', 5500, 'FOOD', 'platter'], ['Chapman (jug)', 3000, 'PERISHABLE', 'jug'], ['Grilled fish', 7500, 'FOOD', 'portion']] },
  { id: 's_kano', name: 'Kano Fabrics & Tailoring', cat: 'Fashion', color: '#7b3fa0', city: 'Kano', state: 'Kano', lat: 12.0022, lng: 8.592, address: '5 Ibrahim Taiwo Road, Nassarawa', desc: 'Hand-woven fabrics and tailored outfits.', items: [['Ankara fabric (6 yards)', 12000, 'GENERAL', 'set'], ['Agbada (tailored)', 45000, 'GENERAL', 'outfit'], ['Fila cap', 3500, 'GENERAL', 'piece']] },
  { id: 's_phbeauty', name: 'PH Glow Beauty', cat: 'Beauty & Health', color: '#d81b60', city: 'Port Harcourt', state: 'Rivers', lat: 4.8156, lng: 7.0498, address: '31 Aba Road, GRA Phase 2', desc: 'Skincare, hair care and wellness products.', items: [['Shea butter (500g)', 4000, 'GENERAL', 'jar'], ['Hair growth oil', 5500, 'FRAGILE', 'bottle'], ['Face wash', 3800, 'GENERAL', 'bottle']] },
  { id: 's_minna', name: 'Minna Campus Stationery', cat: 'Stationery', color: '#00897b', city: 'Minna', state: 'Niger', lat: 9.6139, lng: 6.5569, address: 'Shop 8, Bosso Road', desc: 'Notebooks, printing and everything for school.', items: [['A4 notebook (pack of 5)', 3200, 'GENERAL', 'pack'], ['Printing (per page)', 50, 'GENERAL', 'page'], ['Scientific calculator', 7800, 'ELECTRONICS', 'piece']] },
  { id: 's_ibadan', name: 'Ibadan Hardware Depot', cat: 'Home & Hardware', color: '#6d4c41', city: 'Ibadan', state: 'Oyo', lat: 7.3775, lng: 3.947, address: '9 Ring Road, Challenge', desc: 'Cement, paint, tools and fittings.', items: [['Cement (50kg bag)', 9800, 'BUILDING', 'bag'], ['Paint 20L', 24000, 'BUILDING', 'bucket'], ['Toolbox set', 16500, 'GENERAL', 'set']] },
];

const person = (id: string, name: string, email: string, role: string, extra: Row = {}): Row => ({
  id, name, email, phone: `0803${Math.floor(1000000 + (id.length * 7919) % 8999999)}`, role, status: 'ACTIVE', vehicle: null, fleet: null, country: 'NG', online: false, avatarUrl: null, isSuperAdmin: false, mustChangePassword: false, shopId: null, loginable: false, createdAt: ago(60 * 24 * 20), ...extra,
});

export function seed(): Db {
  const t = nowMs();
  const users: Row[] = [
    person('u_cust', 'Tolu Adebayo', 'student@orbit.demo', 'CUSTOMER', { loginable: true }),
    person('u_merch', 'Nkechi Obi', 'nkechi@orbit.demo', 'MERCHANT', { loginable: true, shopId: 's_nkechi' }),
    person('u_rider', 'Musa Ibrahim', 'rider1@orbit.demo', 'RIDER', { loginable: true, vehicle: 'MOTORCYCLE', fleet: 'LIGHT' }),
    person('u_haul', 'Emeka Nwosu', 'haulier@orbit.demo', 'RIDER', { loginable: true, vehicle: 'TRUCK', fleet: 'HEAVY' }),
    person('u_admin', 'ORBIT Superadmin', 'admin@orbit.demo', 'ADMIN', { loginable: true, isSuperAdmin: true }),
    person('u_admin2', 'Hauwa Bello', 'hauwa@orbit.demo', 'ADMIN'),
    person('c_ngozi', 'Ngozi Eze', 'ngozi@orbit.demo', 'CUSTOMER'),
    person('c_ibrahim', 'Ibrahim Sani', 'ibrahim@orbit.demo', 'CUSTOMER'),
    person('c_funmi', 'Funmi Alade', 'funmi@orbit.demo', 'CUSTOMER'),
    person('d_moto', 'Sunday Okoro', 'sunday@orbit.demo', 'RIDER', { vehicle: 'MOTORCYCLE', fleet: 'LIGHT' }),
    person('d_keke', 'Amina Yusuf', 'amina@orbit.demo', 'RIDER', { vehicle: 'KEKE', fleet: 'LIGHT' }),
    person('d_car', 'Chidi Okafor', 'chidi@orbit.demo', 'RIDER', { vehicle: 'CAR', fleet: 'LIGHT' }),
    person('d_bike', 'Tunde Bakare', 'tunde@orbit.demo', 'RIDER', { vehicle: 'BICYCLE', fleet: 'LIGHT' }),
    person('d_van', 'Kelechi Obi', 'kelechi@orbit.demo', 'RIDER', { vehicle: 'VAN', fleet: 'HEAVY' }),
    person('d_truck', 'Garba Danjuma', 'garba@orbit.demo', 'RIDER', { vehicle: 'TRUCK', fleet: 'HEAVY' }),
    person('d_lorry', 'Femi Adeleke', 'femi@orbit.demo', 'RIDER', { vehicle: 'LORRY', fleet: 'HEAVY' }),
    person('d_long', 'Yakubu Mamman', 'yakubu@orbit.demo', 'RIDER', { vehicle: 'LONG_HAUL', fleet: 'HEAVY' }),
    person('u_pm', 'Bala Mohammed', 'bala@orbit.demo', 'MERCHANT', { status: 'PENDING_VERIFICATION', shopId: 's_pending' }),
    person('u_pr', 'Ada Nwankwo', 'ada@orbit.demo', 'RIDER', { status: 'PENDING_VERIFICATION', vehicle: 'KEKE', fleet: 'LIGHT' }),
  ];

  const shops: Row[] = SHOPS.map((s) => ({ id: s.id, name: s.name, description: s.desc, category: s.cat, address: s.address, color: s.color, isOpen: true, prepMinutes: 15, offersDelivery: true, deliveryFee: 500, rating: 4.3 + ((s.name.length % 7) / 10), ratingCount: 20 + s.name.length * 3, status: 'APPROVED', country: 'NG', currency: 'NGN', city: s.city, state: s.state, lat: s.lat, lng: s.lng, logoUrl: null, coverUrl: null, phone: '08031234567', openingHours: 'Mon–Sat 8am–8pm', ownerId: s.id === 's_nkechi' ? 'u_merch' : null }));
  shops.push({ id: 's_pending', name: 'Bala Foods and Spices', description: 'Spices and dried foods.', category: 'Groceries', address: '3 Zoo Road, Gwarinpa', color: '#8d6e63', isOpen: false, prepMinutes: 20, offersDelivery: false, deliveryFee: 0, rating: null, ratingCount: 0, status: 'PENDING', country: 'NG', currency: 'NGN', city: 'Abuja', state: 'FCT', lat: 9.1108, lng: 7.4042, logoUrl: null, coverUrl: null, phone: '', openingHours: '', ownerId: 'u_pm' });

  const products: Row[] = [];
  for (const s of SHOPS) for (const [name, price, goodsType, unit] of s.items) products.push({ id: uid('p'), shopId: s.id, name, description: `${name}. Fresh and ready to order from ${s.name}.`, kind: 'GOOD', goodsType, images: [], lengthCm: null, widthCm: null, heightCm: null, weightKg: goodsType === 'BUILDING' ? 25 : 1, unitLabel: unit, price, stock: 30, available: true });
  products.push({ id: uid('p'), shopId: 's_techhub', name: 'Phone screen repair (service)', description: 'Bring your phone to our shop; same-day repair.', kind: 'SERVICE', goodsType: 'GENERAL', images: [], lengthCm: null, widthCm: null, heightCm: null, weightKg: null, unitLabel: 'repair', price: 8000, stock: 10, available: true });

  const vehicles: Row[] = [
    { id: 'v_moto', ownerId: 'u_rider', type: 'MOTORCYCLE', fleet: 'LIGHT', label: 'Motorcycle', make: 'Bajaj', model: 'Boxer 150', color: 'Red', plate: 'ABC-123XY', year: 2021, capacityKg: 80, photos: [], status: 'APPROVED', reviewNote: null, isActive: true },
    { id: 'v_truck', ownerId: 'u_haul', type: 'TRUCK', fleet: 'HEAVY', label: 'Truck', make: 'Isuzu', model: 'NPR', color: 'White', plate: 'KJA-456AB', year: 2018, capacityKg: 5000, photos: [], status: 'APPROVED', reviewNote: null, isActive: true },
    { id: 'v_pending', ownerId: 'u_pr', type: 'KEKE', fleet: 'LIGHT', label: 'Keke (tricycle)', make: 'TVS', model: 'King', color: 'Yellow', plate: 'LAG-789CD', year: 2020, capacityKg: 300, photos: [], status: 'PENDING', reviewNote: null, isActive: false },
  ];
  const docs: Row[] = [
    { id: 'doc_1', ownerId: 'u_pm', kind: 'ID_CARD', status: 'PENDING', note: null, mime: 'image/jpeg', createdAt: ago(300) },
    { id: 'doc_2', ownerId: 'u_pm', kind: 'BUSINESS_REG', status: 'PENDING', note: null, mime: 'application/pdf', createdAt: ago(300) },
    { id: 'doc_3', ownerId: 'u_pr', kind: 'DRIVER_LICENCE', status: 'PENDING', note: null, mime: 'image/jpeg', createdAt: ago(200) },
    { id: 'doc_4', ownerId: 'u_pr', kind: 'VEHICLE_PAPERS', status: 'PENDING', note: null, mime: 'image/jpeg', createdAt: ago(200) },
  ];

  const shopRiders: Row[] = [
    { id: 'sr_1', shopId: 's_nkechi', riderId: 'd_moto', status: 'ACTIVE' },
    { id: 'sr_2', shopId: 's_nkechi', riderId: 'd_keke', status: 'ACTIVE' },
    { id: 'sr_3', shopId: 's_nkechi', riderId: 'u_rider', status: 'INVITED' },
  ];

  const promos: Row[] = [
    { id: 'pr_1', code: 'WELCOME20', type: 'PERCENT', value: 20, maxDiscount: 1000, currency: 'NGN', validUntil: iso(t + 30 * 864e5), maxUses: 500, uses: 42, active: true },
    { id: 'pr_2', code: 'FLAT500', type: 'FLAT', value: 500, maxDiscount: null, currency: 'NGN', validUntil: iso(t + 10 * 864e5), maxUses: 100, uses: 7, active: true },
  ];

  const db: Db = { v: DB_VERSION, seq: 1000, users, shops, products, orders: [], trips: [], offers: [], notifs: [], sos: [], promos, vehicles, docs, shopRiders, favs: { u_cust: ['s_nkechi', 's_greenbasket'] }, places: [
    { id: 'pl_1', ownerId: 'u_cust', label: 'Home', address: 'Gwarinpa Estate, Abuja', lat: 9.1108, lng: 7.4042 },
    { id: 'pl_2', ownerId: 'u_cust', label: 'Work', address: 'Jabi Lake Mall, Jabi, Abuja', lat: 9.0725, lng: 7.4264 },
  ] };
  return db;
}

export const CATEGORIES = [...SHOP_CATEGORIES];
