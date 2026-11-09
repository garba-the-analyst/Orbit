/**
 * End-to-end tests for the v2 commerce features: notifications, favourites, sending your own rider to collect,
 * services, shop owners buying, shop riders, reorder, goods labelling and per-currency KPIs.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { LedgerEntry } from '../src/earnings/ledger-entry.entity';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';

let app: INestApplication;
let db: DataSource;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const tokens = new Map<string, string>();

async function login(email: string): Promise<string> {
  if (tokens.has(email)) return tokens.get(email)!;
  const res = await api().post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  tokens.set(email, res.body.token);
  return res.body.token;
}

async function shopByName(token: string, fragment: string) {
  const shops = (await api().get('/api/shops').set(bearer(token)).expect(200)).body;
  const shop = shops.find((s: { name: string }) => s.name.includes(fragment));
  const detail = (await api().get(`/api/shops/${shop.id}`).set(bearer(token)).expect(200)).body;
  return { shop, products: detail.products as Array<{ id: string; name: string; price: number; stock: number; kind: string }> };
}

async function pay(token: string, created: { body: { payment: { reference: string } } }) {
  await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(token)).send({ outcome: 'success' }).expect(200);
}

async function placeAndPay(token: string, body: Record<string, unknown>) {
  const created = await api().post('/api/orders').set(bearer(token)).send(body).expect(201);
  await pay(token, created);
  return created.body.order.id as string;
}

const ledger = async (orderId: string) => {
  const rows = await db.getRepository(LedgerEntry).find({ where: { orderId } });
  const sum = (party: string) => rows.filter((r) => r.party === party).reduce((s, r) => s + r.amount, 0);
  return { merchant: sum('MERCHANT'), courier: sum('COURIER'), platform: sum('PLATFORM'), all: rows.reduce((s, r) => s + r.amount, 0), rows };
};

const orderView = async (token: string, id: string) => (await api().get(`/api/orders/${id}`).set(bearer(token)).expect(200)).body;
const stockOf = async (token: string, shopFragment: string, productId: string) =>
  (await shopByName(token, shopFragment)).products.find((p) => p.id === productId)!.stock;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  db = app.get(DataSource);
  await app.get(SeedService).run();
});

afterAll(async () => {
  await app.close();
});

// =====================================================================================================
describe('notifications', () => {
  it('tells the shop and the customer in words, keeps them private, and tracks read state', async () => {
    const customer = await login('student@orbit.demo');
    const owner = await login('suleiman@orbit.demo');
    const { shop, products } = await shopByName(customer, 'Suya');
    const id = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: products[0].id, qty: 1 }], fulfilment: 'PICKUP' });

    const shopInbox = (await api().get('/api/notifications').set(bearer(owner)).expect(200)).body;
    const placed = shopInbox.find((n: { type: string; data: { orderId: string } }) => n.type === 'order.placed' && n.data.orderId === id);
    expect(placed).toBeTruthy();
    expect(placed.title).toMatch(/New order ORB-/);
    expect(placed.read).toBe(false);

    const custInbox = (await api().get('/api/notifications').set(bearer(customer)).expect(200)).body;
    expect(custInbox.some((n: { type: string }) => n.type === 'order.paid')).toBe(true);
    expect(custInbox.some((n: { type: string }) => n.type === 'order.placed')).toBe(false); // the shop's message is not theirs

    const before = (await api().get('/api/notifications/unread-count').set(bearer(owner)).expect(200)).body.unread;
    expect(before).toBeGreaterThan(0);

    // You can only mark your own read: the customer cannot clear the shop's alert.
    await api().post('/api/notifications/read').set(bearer(customer)).send({ ids: [placed.id] }).expect(200);
    expect((await api().get('/api/notifications/unread-count').set(bearer(owner)).expect(200)).body.unread).toBe(before);
    await api().post('/api/notifications/read').set(bearer(owner)).send({ ids: [placed.id] }).expect(200);
    expect((await api().get('/api/notifications/unread-count').set(bearer(owner)).expect(200)).body.unread).toBe(before - 1);

    await api().post('/api/notifications/read').set(bearer(owner)).send({}).expect(200);
    expect((await api().get('/api/notifications/unread-count').set(bearer(owner)).expect(200)).body.unread).toBe(0);
    await api().post('/api/notifications/read').set(bearer(owner)).send({ ids: ['not-a-uuid'] }).expect(400);
    await api().get('/api/notifications').expect(401);
  });

  it('follows an order to the end: accepted, ready, delivered, with the earnings in the shop’s message', async () => {
    const customer = await login('student2@orbit.demo');
    const owner = await login('hauwa@orbit.demo');
    const { shop, products } = await shopByName(customer, 'Fresh Fruit');
    const id = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: products[0].id, qty: 2 }], fulfilment: 'PICKUP' });
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(owner)).send({ prepMinutes: 10 }).expect(200);
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(owner)).expect(200);
    const pin = (await orderView(customer, id)).pin;
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(owner)).send({ pin }).expect(200);

    const types = (await api().get('/api/notifications').set(bearer(customer)).expect(200)).body.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['order.confirmed', 'order.ready', 'order.delivered']));
    const done = (await api().get('/api/notifications').set(bearer(owner)).expect(200)).body.find((n: { type: string; data: { orderId: string } }) => n.type === 'order.completed' && n.data.orderId === id);
    expect(done.body).toMatch(/You earned/);
    expect(done.body).toMatch(/₦/); // formatted in the order's currency
  });

  it('pushes a signal to the open app, and ends sockets when the password changes', async () => {
    await app.listen(0);
    const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const customer = await login('student@orbit.demo');
    const owner = await login('chinedu@orbit.demo');
    const socket = connect(url, { auth: { token: owner }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => { socket.on('connect', () => resolve()); socket.on('connect_error', reject); });
    const ping = new Promise<{ id: string }>((resolve) => socket.on('notification.new', resolve));
    const { shop, products } = await shopByName(customer, 'Tech Corner');
    await placeAndPay(customer, { shopId: shop.id, items: [{ productId: products[0].id, qty: 1 }], fulfilment: 'PICKUP' });
    expect(Object.keys(await ping)).toEqual(['id']); // an id only: the words are fetched over REST
    socket.close();

    // A fresh account changes its password; its old token can no longer open a socket.
    const reg = await api().post('/api/auth/register').send({ name: 'Sock Et', email: 'sock@example.com', phone: '08031230999', password: 'Strong123', role: 'CUSTOMER' }).expect(201);
    await api().post('/api/me/password').set(bearer(reg.body.token)).send({ currentPassword: 'Strong123', newPassword: 'Stronger456' }).expect(200);
    const stale = connect(url, { auth: { token: reg.body.token }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => stale.on('disconnect', () => resolve()));
    stale.close();
  });
});

// =====================================================================================================
describe('favourites', () => {
  it('saves, lists, de-duplicates and removes shops, per person', async () => {
    const ada = await login('student@orbit.demo');
    const bola = await login('student2@orbit.demo');
    const { shop } = await shopByName(ada, 'Nkechi');
    await api().put(`/api/favourites/${shop.id}`).set(bearer(ada)).expect(200);
    await api().put(`/api/favourites/${shop.id}`).set(bearer(ada)).expect(200); // harmless twice
    expect((await api().get('/api/favourites/ids').set(bearer(ada)).expect(200)).body).toEqual([shop.id]);
    expect((await api().get('/api/favourites').set(bearer(ada)).expect(200)).body.map((s: { name: string }) => s.name)).toEqual([shop.name]);
    expect((await api().get('/api/favourites/ids').set(bearer(bola)).expect(200)).body).toEqual([]);
    await api().put('/api/favourites/00000000-0000-4000-8000-000000000000').set(bearer(ada)).expect(400);
    await api().put('/api/favourites/nope').set(bearer(ada)).expect(400);
    await api().delete(`/api/favourites/${shop.id}`).set(bearer(ada)).expect(200);
    expect((await api().get('/api/favourites/ids').set(bearer(ada)).expect(200)).body).toEqual([]);
  });
});

// =====================================================================================================
describe('sending your own rider to collect', () => {
  it('needs a collector but no address, hands over with the PIN at the counter, and ORBIT takes only commission', async () => {
    const customer = await login('student@orbit.demo');
    const owner = await login('nkechi@orbit.demo');
    const { shop, products } = await shopByName(customer, 'Nkechi');
    const items = [{ productId: products[0].id, qty: 2 }];

    await api().post('/api/orders').set(bearer(customer)).send({ shopId: shop.id, items, fulfilment: 'CUSTOMER_RIDER' }).expect(400); // who is collecting?
    const created = await api().post('/api/orders').set(bearer(customer)).send({
      shopId: shop.id, items, fulfilment: 'CUSTOMER_RIDER', collectorName: 'Musa Dispatch', collectorPhone: '08031230777',
    }).expect(201);
    expect(created.body.order).toMatchObject({ fulfilment: 'CUSTOMER_RIDER', deliveryFee: 0, deliveryAddress: null });
    expect(created.body.order.collector).toMatchObject({ name: 'Musa Dispatch', phone: '+2348031230777' });
    const id = created.body.order.id;
    await pay(customer, created);

    const shopSees = await orderView(owner, id);
    expect(shopSees.collector.name).toBe('Musa Dispatch');
    expect(shopSees.pin).toBeNull();
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(owner)).send({}).expect(200);
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(owner)).expect(200);
    await api().post(`/api/merchant/orders/${id}/dispatch`).set(bearer(owner)).send({}).expect(400); // not a shop delivery

    const pin = (await orderView(customer, id)).pin;
    const wrong = pin === '0000' ? '1111' : '0000';
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(owner)).send({ pin: wrong }).expect(400);
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(owner)).send({ pin }).expect(200);

    const l = await ledger(id);
    expect(l.all).toBe(created.body.order.total);
    expect(l.courier).toBe(0);
    expect(l.platform).toBe(created.body.order.money?.commission ?? l.platform);
    expect(l.platform).toBe(Math.round(created.body.order.subtotal * 0.08));
  });

  it('is not offered by a rider who is not part of the order', async () => {
    const customer = await login('student@orbit.demo');
    const rider = await login('rider1@orbit.demo');
    const { shop, products } = await shopByName(customer, 'Nkechi');
    const id = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: products[0].id, qty: 1 }], fulfilment: 'CUSTOMER_RIDER', collectorName: 'Someone' });
    await api().get(`/api/orders/${id}`).set(bearer(rider)).expect(404);
    await api().post(`/api/rider/jobs/${id}/claim`).set(bearer(rider)).expect(409);
  });
});

// =====================================================================================================
describe('services and goods', () => {
  it('books services with the shop only, never reserves stock for them, and refunds cleanly', async () => {
    const owner = await login('nkechi@orbit.demo');
    const customer = await login('student@orbit.demo');
    const svc = (await api().post('/api/merchant/products').set(bearer(owner)).send({ name: 'Cooking class', price: 8000, kind: 'SERVICE', unitLabel: 'per person' }).expect(201)).body;
    const { shop } = await shopByName(customer, 'Nkechi');
    const items = [{ productId: svc.id, qty: 2 }];

    await api().post('/api/orders').set(bearer(customer)).send({ shopId: shop.id, items, fulfilment: 'ORBIT_COURIER', deliveryAddress: '12 Allen Avenue, Ikeja' }).expect(400);
    await api().post('/api/orders').set(bearer(customer)).send({ shopId: shop.id, items, fulfilment: 'CUSTOMER_RIDER', collectorName: 'Nobody' }).expect(400);

    const created = await api().post('/api/orders').set(bearer(customer)).send({ shopId: shop.id, items, fulfilment: 'PICKUP' }).expect(201);
    expect(created.body.order.hasService).toBe(true);
    await api().post(`/api/orders/${created.body.order.id}/cancel`).set(bearer(customer)).send({}).expect(200);
    const list = (await api().get('/api/merchant/products').set(bearer(owner)).expect(200)).body;
    expect(list.find((p: { id: string }) => p.id === svc.id).stock).toBe(svc.stock); // untouched by order and cancel
  });

  it('labels the basket by its most delicate goods and totals the weight', async () => {
    const owner = await login('nkechi@orbit.demo');
    const customer = await login('student@orbit.demo');
    const food = (await api().post('/api/merchant/products').set(bearer(owner)).send({ name: 'Pepper soup', price: 3000, stock: 10, goodsType: 'FOOD', weightKg: 1.5 }).expect(201)).body;
    const fresh = (await api().post('/api/merchant/products').set(bearer(owner)).send({ name: 'Fresh catfish', price: 6000, stock: 10, goodsType: 'PERISHABLE', weightKg: 2 }).expect(201)).body;
    const { shop } = await shopByName(customer, 'Nkechi');
    const created = await api().post('/api/orders').set(bearer(customer)).send({
      shopId: shop.id, fulfilment: 'PICKUP', items: [{ productId: food.id, qty: 2 }, { productId: fresh.id, qty: 1 }],
    }).expect(201);
    expect(created.body.order.goods).toMatchObject({ type: 'PERISHABLE', careful: true, urgent: true, weightKg: 5 });
    expect(created.body.order.goods.handling).toMatch(/cool/i);
  });
});

// =====================================================================================================
describe('shop owners buying, and reordering', () => {
  it('lets a shop owner shop as a customer, but not from their own shop, and shows each view for what it is', async () => {
    const nkechi = await login('nkechi@orbit.demo');
    const suleiman = await login('suleiman@orbit.demo');
    const { shop, products } = await shopByName(nkechi, 'Suya');
    const own = await shopByName(nkechi, 'Nkechi');

    await api().post('/api/orders').set(bearer(nkechi)).send({ shopId: own.shop.id, items: [{ productId: own.products[0].id, qty: 1 }], fulfilment: 'PICKUP' }).expect(400);

    const id = await placeAndPay(nkechi, { shopId: shop.id, items: [{ productId: products[0].id, qty: 1 }], fulfilment: 'PICKUP' });
    const asBuyer = await orderView(nkechi, id);
    expect(asBuyer.pin).toMatch(/^\d{4}$/); // the buyer's view, with the PIN
    expect(asBuyer.money).toEqual({});
    const asSeller = await orderView(suleiman, id);
    expect(asSeller.pin).toBeNull();
    expect(asSeller.money.itemSales).toBeGreaterThan(0);

    const mine = (await api().get('/api/orders').set(bearer(nkechi)).expect(200)).body;
    expect(mine.some((o: { id: string }) => o.id === id)).toBe(true);
    const sales = (await api().get('/api/merchant/orders').set(bearer(nkechi)).expect(200)).body;
    expect(sales.some((o: { id: string }) => o.id === id)).toBe(false); // a purchase is not one of her sales
  });

  it('offers a past order back with today’s stock and prices', async () => {
    const customer = await login('student@orbit.demo');
    const owner = await login('chinedu@orbit.demo');
    const { shop, products } = await shopByName(customer, 'Tech Corner');
    const a = products[0];
    const b = products[1];
    const id = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: a.id, qty: 2 }, { productId: b.id, qty: 1 }], fulfilment: 'PICKUP' });

    await api().patch(`/api/merchant/products/${b.id}`).set(bearer(owner)).send({ available: false }).expect(200);
    await api().patch(`/api/merchant/products/${a.id}`).set(bearer(owner)).send({ price: a.price + 100 }).expect(200);
    const re = (await api().get(`/api/orders/${id}/reorder`).set(bearer(customer)).expect(200)).body;
    expect(re.shopId).toBe(shop.id);
    expect(re.lines.find((l: { productId: string }) => l.productId === a.id)).toMatchObject({ qty: 2, unitPrice: a.price + 100, available: true });
    expect(re.lines.find((l: { productId: string }) => l.productId === b.id).available).toBe(false);
    await api().get(`/api/orders/${id}/reorder`).set(bearer(owner)).expect(404); // not their order
  });
});

// =====================================================================================================
describe('a shop’s own riders', () => {
  it('invites, needs acceptance, delivers with the PIN, and the shop keeps the whole delivery fee', async () => {
    const owner = await login('nkechi@orbit.demo');
    const customer = await login('student2@orbit.demo');
    const rider = await login('rider1@orbit.demo');
    const other = await login('rider2@orbit.demo');
    await api().patch('/api/merchant/shop').set(bearer(owner)).send({ offersDelivery: true, deliveryFee: 600 }).expect(200);

    // Unknown people and non-riders get the same answer.
    await api().post('/api/merchant/riders').set(bearer(owner)).send({ identifier: 'nobody@example.com' }).expect(404);
    await api().post('/api/merchant/riders').set(bearer(owner)).send({ identifier: 'student@orbit.demo' }).expect(404);
    await api().post('/api/merchant/riders').set(bearer(owner)).send({ identifier: 'rider3@orbit.demo' }).expect(404); // still awaiting approval

    const invited = (await api().post('/api/merchant/riders').set(bearer(owner)).send({ identifier: 'rider1@orbit.demo' }).expect(201)).body;
    await api().post('/api/merchant/riders').set(bearer(owner)).send({ identifier: 'rider1@orbit.demo' }).expect(409);
    expect((await api().get('/api/merchant/riders').set(bearer(owner)).expect(200)).body[0]).toMatchObject({ status: 'INVITED', phone: null });

    const { shop, products } = await shopByName(customer, 'Nkechi');
    const id = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: products[0].id, qty: 1 }], fulfilment: 'MERCHANT_DELIVERY', deliveryAddress: '5 Ahmadu Bello Way, Abuja', deliveryLat: 9.05, deliveryLng: 7.49 });
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(owner)).send({}).expect(200);
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(owner)).expect(200);
    await api().post(`/api/merchant/orders/${id}/dispatch`).set(bearer(owner)).send({ riderId: invited.riderId }).expect(400); // has not accepted yet

    const mine = (await api().get('/api/rider/shops').set(bearer(rider)).expect(200)).body;
    expect(mine[0]).toMatchObject({ status: 'INVITED', shop: { name: expect.stringContaining('Nkechi') } });
    await api().post(`/api/rider/shops/${mine[0].id}/accept`).set(bearer(other)).expect(404); // not their invitation
    await api().post(`/api/rider/shops/${mine[0].id}/accept`).set(bearer(rider)).expect(200);
    expect((await api().get('/api/merchant/riders').set(bearer(owner)).expect(200)).body[0]).toMatchObject({ status: 'ACTIVE', phone: expect.any(String) });

    await api().post(`/api/merchant/orders/${id}/dispatch`).set(bearer(owner)).send({ riderId: (await api().get('/api/merchant/riders').set(bearer(owner))).body[0].riderId }).expect(200);

    const riderSees = await orderView(rider, id);
    expect(riderSees).toMatchObject({ deliveryAddress: '5 Ahmadu Bello Way, Abuja', dropoff: { lat: 9.05, lng: 7.49 }, redacted: false });
    await api().get(`/api/orders/${id}`).set(bearer(other)).expect(404);
    const customerSees = await orderView(customer, id);
    expect(customerSees.courier.name).toBeTruthy();

    const pin = customerSees.pin;
    const wrong = pin === '0000' ? '1111' : '0000';
    await api().post(`/api/rider/jobs/${id}/deliver`).set(bearer(other)).send({ pin }).expect(404);
    await api().post(`/api/rider/jobs/${id}/deliver`).set(bearer(rider)).send({ pin: wrong }).expect(400);
    await api().post(`/api/rider/jobs/${id}/deliver`).set(bearer(rider)).send({ pin }).expect(200);

    const l = await ledger(id);
    expect(l.all).toBe(customerSees.total);
    expect(l.courier).toBe(0); // the shop pays its own rider; ORBIT's books do not
    expect(l.merchant).toBe(customerSees.subtotal - Math.round(customerSees.subtotal * 0.08) + 600);

    // Removing the rider ends the link.
    const link = (await api().get('/api/merchant/riders').set(bearer(owner)).expect(200)).body[0];
    await api().delete(`/api/merchant/riders/${link.id}`).set(bearer(owner)).expect(200);
    expect((await api().get('/api/merchant/riders').set(bearer(owner)).expect(200)).body).toEqual([]);
  });

  it('keeps riders out of merchant routes and merchants out of rider routes', async () => {
    const rider = await login('rider1@orbit.demo');
    const owner = await login('nkechi@orbit.demo');
    await api().get('/api/merchant/riders').set(bearer(rider)).expect(403);
    await api().get('/api/rider/shops').set(bearer(owner)).expect(403);
  });
});

// =====================================================================================================
describe('KPIs by currency', () => {
  it('reports one currency at a time and rejects malformed codes', async () => {
    const root = (await api().post('/api/auth/login').send({ email: 'root@orbit.test', password: 'Root@2026test' }).expect(200)).body.token;
    const ngn = (await api().get('/api/admin/kpis').set(bearer(root)).expect(200)).body;
    expect(ngn.currency).toBe('NGN');
    expect(ngn.currencies).toContain('NGN');
    expect(ngn.marketplace.completedOrders).toBeGreaterThan(0);
    const ghs = (await api().get('/api/admin/kpis?currency=GHS').set(bearer(root)).expect(200)).body;
    expect(ghs.marketplace.completedOrders).toBe(0);
    expect(ghs.financial.platformRevenue).toBe(0);
    await api().get('/api/admin/kpis?currency=naira').set(bearer(root)).expect(400);
  });
});
