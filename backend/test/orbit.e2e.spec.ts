/**
 * End-to-end tests: the real Nest application (same guards, pipes and headers as production) on an
 * in-memory SQLite database, driven over HTTP. They prove the proposal's core workflow:
 *
 *   browse -> pay -> merchant confirms -> fulfilment choice -> PIN confirmation -> settlement
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { LedgerEntry } from '../src/earnings/ledger-entry.entity';
import { OrdersService } from '../src/orders/orders.service';
import { Payment } from '../src/payments/payment.entity';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';

let app: INestApplication;
let db: DataSource;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return res.body.token;
}

/** Finds a shop by name and one of its products by name. */
async function findProduct(token: string, shopName: string, productName: string) {
  const shops = (await api().get('/api/shops').set(bearer(token)).expect(200)).body;
  const shop = shops.find((s: { name: string }) => s.name === shopName);
  const detail = (await api().get(`/api/shops/${shop.id}`).set(bearer(token)).expect(200)).body;
  const product = detail.products.find((p: { name: string }) => p.name === productName);
  return { shop, product, products: detail.products };
}

async function placeAndPay(
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string; total: number }> {
  const created = await api().post('/api/orders').set(bearer(token)).send(body).expect(201);
  await api()
    .post(`/api/payments/${created.body.payment.reference}/simulate`)
    .set(bearer(token))
    .send({ outcome: 'success' })
    .expect(200);
  return { id: created.body.order.id, total: created.body.order.total };
}

const ledgerTotals = async (orderId: string) => {
  const rows = await db.getRepository(LedgerEntry).find({ where: { orderId } });
  const sum = (party: string) => rows.filter((r) => r.party === party).reduce((s, r) => s + r.amount, 0);
  return { merchant: sum('MERCHANT'), courier: sum('COURIER'), platform: sum('PLATFORM'), all: rows.reduce((s, r) => s + r.amount, 0) };
};

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
describe('authentication and authorisation', () => {
  it('serves public health and config without a token, and hides demo accounts from nobody in test mode', async () => {
    await api().get('/api/health').expect(200).expect((r) => expect(r.body.db).toBe('up'));
    const cfg = (await api().get('/api/config').expect(200)).body;
    expect(cfg.commissionPct).toBe(8);
    expect(cfg.orbitDeliveryFee).toBe(700);
  });

  it('rejects requests without a valid token', async () => {
    await api().get('/api/shops').expect(401);
    await api().get('/api/shops').set(bearer('not-a-token')).expect(401);
  });

  it('registers a customer, blocks duplicate emails and weak passwords, and rejects unknown fields', async () => {
    const body = { name: 'Ada Eze', email: 'ada@example.com', phone: '0803 123 4567', password: 'Strong123', role: 'CUSTOMER' };
    const ok = await api().post('/api/auth/register').send(body).expect(201);
    expect(ok.body.user.role).toBe('CUSTOMER');
    expect(ok.body.user.phone).toBe('08031234567'); // spaces stripped
    expect(ok.body.user.passwordHash).toBeUndefined();

    await api().post('/api/auth/register').send(body).expect(409);
    await api().post('/api/auth/register').send({ ...body, email: 'b@example.com', password: 'short1' }).expect(400);
    await api().post('/api/auth/register').send({ ...body, email: 'c@example.com', password: 'nonumbershere' }).expect(400);
    await api().post('/api/auth/register').send({ ...body, email: 'd@example.com', phone: '12345' }).expect(400);
    await api().post('/api/auth/register').send({ ...body, email: 'e@example.com', role: 'ADMIN' }).expect(400);
    await api().post('/api/auth/register').send({ ...body, email: 'f@example.com', isAdmin: true }).expect(400);
  });

  it('gives one generic error for wrong passwords and unknown emails, then locks after 5 failures', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: 'ada@example.com', password: 'Nope12345' }).expect(401);
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@example.com', password: 'Nope12345' }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);

    for (let i = 0; i < 4; i++) {
      await api().post('/api/auth/login').send({ email: 'ada@example.com', password: 'Nope12345' }).expect(401);
    }
    await api().post('/api/auth/login').send({ email: 'ada@example.com', password: 'Strong123' }).expect(429);
  });

  it('enforces roles: customers cannot use merchant, rider or admin routes', async () => {
    const t = await login('student@orbit.demo');
    await api().get('/api/merchant/orders').set(bearer(t)).expect(403);
    await api().get('/api/rider/jobs').set(bearer(t)).expect(403);
    await api().get('/api/admin/kpis').set(bearer(t)).expect(403);
  });

  it('keeps new merchants and riders out until an admin verifies them', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({
        name: 'Bola Ade', email: 'bola@example.com', phone: '08035550001', password: 'Strong123', role: 'MERCHANT',
        shopName: 'Bola Bites', shopCategory: 'Food', shopAddress: 'Hostel B kiosk',
      })
      .expect(201);
    expect(reg.body.user.status).toBe('PENDING_VERIFICATION');
    const t = reg.body.token;
    await api().get('/api/merchant/products').set(bearer(t)).expect(403);

    // Not visible to customers yet.
    const customer = await login('student@orbit.demo');
    const shops = (await api().get('/api/shops').set(bearer(customer)).expect(200)).body;
    expect(shops.find((s: { name: string }) => s.name === 'Bola Bites')).toBeUndefined();

    // Admin approves; the merchant can now operate and the shop is public.
    const admin = await login('admin@orbit.demo');
    const queue = (await api().get('/api/admin/queue').set(bearer(admin)).expect(200)).body;
    const entry = queue.merchants.find((m: { email: string }) => m.email === 'bola@example.com');
    expect(entry.shop.name).toBe('Bola Bites');
    await api().post(`/api/admin/users/${entry.userId}/approve`).set(bearer(admin)).expect(200);
    await api().post(`/api/admin/users/${entry.userId}/approve`).set(bearer(admin)).expect(400); // already approved

    await api().post('/api/merchant/products').set(bearer(t)).send({ name: 'Puff puff', price: 500, stock: 20 }).expect(201);
    const after = (await api().get('/api/shops').set(bearer(customer)).expect(200)).body;
    expect(after.find((s: { name: string }) => s.name === 'Bola Bites')).toBeDefined();
  });

  it('suspension takes effect on the next request', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Temp User', email: 'temp@example.com', phone: '08035550002', password: 'Strong123', role: 'CUSTOMER' })
      .expect(201);
    const admin = await login('admin@orbit.demo');
    await api().post(`/api/admin/users/${reg.body.user.id}/suspend`).set(bearer(admin)).expect(200);
    await api().get('/api/me').set(bearer(reg.body.token)).expect(401);
  });
});

// =====================================================================================================
describe('catalogue and merchant controls', () => {
  it('searches shops by shop name, category and product name', async () => {
    const t = await login('student@orbit.demo');
    const byProduct = (await api().get('/api/shops?q=jollof').set(bearer(t)).expect(200)).body;
    expect(byProduct.map((s: { name: string }) => s.name)).toEqual(['Mama Nkechi’s Kitchen']);
    const byCategory = (await api().get('/api/shops?category=Food').set(bearer(t)).expect(200)).body;
    expect(byCategory.length).toBeGreaterThanOrEqual(2);
    const wildcard = (await api().get('/api/shops?q=%25').set(bearer(t)).expect(200)).body;
    expect(wildcard).toEqual([]); // "%" is searched literally, not as a wildcard
  });

  it('blocks prohibited goods when a merchant adds a product', async () => {
    const t = await login('ibrahim@orbit.demo');
    await api().post('/api/merchant/products').set(bearer(t)).send({ name: 'Cold beer', price: 800, stock: 10 }).expect(400);
    await api().post('/api/merchant/products').set(bearer(t)).send({ name: 'Zobo drink', price: 300, stock: 10 }).expect(201);
  });

  it('stops a merchant from editing another shop’s products', async () => {
    const owner = await login('olayinka@orbit.demo');
    const mine = (await api().get('/api/merchant/products').set(bearer(owner)).expect(200)).body;
    const other = await login('chinedu@orbit.demo');
    await api().patch(`/api/merchant/products/${mine[0].id}`).set(bearer(other)).send({ price: 1 }).expect(404);
    await api().delete(`/api/merchant/products/${mine[0].id}`).set(bearer(other)).expect(404);
  });

  it('refuses orders from a closed shop and a non-delivering shop’s own delivery', async () => {
    const customer = await login('student@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Gate 2 Suya Spot', 'Beef suya');
    await api().post('/api/orders').set(bearer(customer))
      .send({ shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'MERCHANT_DELIVERY', deliveryAddress: 'Hostel A, Room 4' })
      .expect(400);

    const merchant = await login('suleiman@orbit.demo');
    await api().patch('/api/merchant/shop').set(bearer(merchant)).send({ isOpen: false }).expect(200);
    await api().post('/api/orders').set(bearer(customer))
      .send({ shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' })
      .expect(409);
    await api().patch('/api/merchant/shop').set(bearer(merchant)).send({ isOpen: true }).expect(200);
  });
});

// =====================================================================================================
describe('order flow: ORBIT courier delivery (the full proposal workflow)', () => {
  it('runs from checkout to PIN-confirmed delivery and settles the money exactly', async () => {
    const customer = await login('student@orbit.demo');
    const merchant = await login('nkechi@orbit.demo');
    const rider = await login('rider1@orbit.demo');
    const { shop, products } = await findProduct(customer, 'Mama Nkechi’s Kitchen', 'Jollof rice and chicken');
    const jollof = products.find((p: { name: string }) => p.name === 'Jollof rice and chicken');
    const moimoi = products.find((p: { name: string }) => p.name === 'Moi moi');

    // --- Checkout: prices come from the server ---------------------------------------------------
    const created = await api().post('/api/orders').set(bearer(customer))
      .send({
        shopId: shop.id,
        items: [{ productId: jollof.id, qty: 2 }, { productId: moimoi.id, qty: 1 }],
        fulfilment: 'ORBIT_COURIER',
        deliveryAddress: 'Hostel A, Room 12',
        deliveryNote: 'Call when at the gate',
      })
      .expect(201);
    const orderId: string = created.body.order.id;
    expect(created.body.order.subtotal).toBe(6400); // 2 x 2,800 + 800
    expect(created.body.order.deliveryFee).toBe(700);
    expect(created.body.order.total).toBe(7100);
    expect(created.body.order.status).toBe('PENDING_PAYMENT');
    expect(created.body.order.waybillNo).toMatch(/^ORB-\d{6}-[A-Z0-9]{4}$/);
    expect(created.body.payment.amount).toBe(7100);

    // Stock was reserved immediately.
    const afterReserve = (await findProduct(customer, 'Mama Nkechi’s Kitchen', 'Moi moi')).product;
    expect(afterReserve.stock).toBe(39);

    // Merchant sees nothing until it is paid.
    expect((await api().get('/api/merchant/orders').set(bearer(merchant)).expect(200)).body).toHaveLength(0);

    // --- Payment: a failed attempt, then a retry that succeeds ----------------------------------------
    await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(customer)).send({ outcome: 'failed' }).expect(200);
    const retry = await api().post(`/api/orders/${orderId}/pay`).set(bearer(customer)).expect(200);
    await api().post(`/api/payments/${retry.body.reference}/simulate`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);
    // Replaying the same successful payment is harmless.
    await api().post(`/api/payments/${retry.body.reference}/simulate`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);

    let order = (await api().get(`/api/orders/${orderId}`).set(bearer(customer)).expect(200)).body;
    expect(order.status).toBe('PLACED');
    expect(order.pin).toMatch(/^\d{4}$/);

    // --- Merchant side ------------------------------------------------------------------------------
    const merchantList = (await api().get('/api/merchant/orders').set(bearer(merchant)).expect(200)).body;
    expect(merchantList).toHaveLength(1);
    const mv = merchantList[0];
    expect(mv.customer.name).toBe('Zainab'); // first name only
    expect(mv.customer.phone).toBeNull();     // courier order: the shop does not need contact details
    expect(mv.deliveryAddress).toBeNull();
    expect(mv.pin).toBeNull();
    expect(mv.money).toEqual({ itemSales: 6400, commission: 512, yourEarnings: 5888 });

    await api().post(`/api/merchant/orders/${orderId}/ready`).set(bearer(merchant)).expect(409); // must accept first
    await api().post(`/api/merchant/orders/${orderId}/accept`).set(bearer(merchant)).send({ prepMinutes: 20 }).expect(200);

    // --- Rider side: job board hides personal data until accepted -----------------------------------
    const board = (await api().get('/api/rider/jobs').set(bearer(rider)).expect(200)).body;
    const job = board.find((j: { id: string }) => j.id === orderId);
    expect(job).toBeDefined();
    expect(job.redacted).toBe(true);
    expect(job.customer).toBeNull();
    expect(job.deliveryAddress).toBeNull();
    expect(job.money.payout).toBe(400);

    const claimed = (await api().post(`/api/rider/jobs/${orderId}/claim`).set(bearer(rider)).expect(200)).body;
    expect(claimed.redacted).toBe(false);
    expect(claimed.deliveryAddress).toBe('Hostel A, Room 12');
    expect(claimed.customer.phone).toBe('08031230100');

    // Cannot collect before the shop marks it ready.
    await api().post(`/api/rider/jobs/${orderId}/pickup`).set(bearer(rider)).expect(409);
    await api().post(`/api/merchant/orders/${orderId}/ready`).set(bearer(merchant)).expect(200);
    await api().post(`/api/rider/jobs/${orderId}/pickup`).set(bearer(rider)).expect(200);

    // Customer sees the assigned rider.
    order = (await api().get(`/api/orders/${orderId}`).set(bearer(customer)).expect(200)).body;
    expect(order.status).toBe('ON_THE_WAY');
    expect(order.courier.name).toBe('Abdul Rahman');

    // --- PIN confirmation ---------------------------------------------------------------------------
    const wrong = order.pin === '0000' ? '1111' : '0000';
    const bad = await api().post(`/api/rider/jobs/${orderId}/deliver`).set(bearer(rider)).send({ pin: wrong }).expect(400);
    expect(bad.body.message).toContain('4 tries left');
    await api().post(`/api/rider/jobs/${orderId}/deliver`).set(bearer(rider)).send({ pin: 'abcd' }).expect(400);
    // The shop cannot complete a courier delivery.
    await api().post(`/api/merchant/orders/${orderId}/complete`).set(bearer(merchant)).send({ pin: order.pin }).expect(404);

    const done = (await api().post(`/api/rider/jobs/${orderId}/deliver`).set(bearer(rider)).send({ pin: order.pin }).expect(200)).body;
    expect(done.status).toBe('DELIVERED');
    expect(done.pin).toBeNull();

    // --- Settlement: every naira is accounted for ---------------------------------------------------
    const t = await ledgerTotals(orderId);
    expect(t.merchant).toBe(5888);  // 6,400 - 8% commission
    expect(t.courier).toBe(400);
    expect(t.platform).toBe(812);   // 512 commission + 300 delivery contribution
    expect(t.all).toBe(7100);       // equals what the customer paid

    const merchantEarnings = (await api().get('/api/merchant/earnings').set(bearer(merchant)).expect(200)).body;
    expect(merchantEarnings.total).toBe(5888);
    expect(merchantEarnings.recent[0].waybillNo).toBe(created.body.order.waybillNo);
    const riderEarnings = (await api().get('/api/rider/earnings').set(bearer(rider)).expect(200)).body;
    expect(riderEarnings.total).toBe(400);

    // --- Rating -------------------------------------------------------------------------------------
    await api().post(`/api/orders/${orderId}/rate`).set(bearer(customer)).send({ rating: 5, comment: 'Hot and quick' }).expect(200);
    await api().post(`/api/orders/${orderId}/rate`).set(bearer(customer)).send({ rating: 1 }).expect(409); // only once
    const shops = (await api().get('/api/shops').set(bearer(customer)).expect(200)).body;
    expect(shops.find((s: { name: string }) => s.name === 'Mama Nkechi’s Kitchen').rating).toBe(5);

    // A delivered order cannot be cancelled.
    await api().post(`/api/orders/${orderId}/cancel`).set(bearer(customer)).send({}).expect(409);
  });
});

describe('order flow: pickup and merchant delivery', () => {
  it('pickup: the shop verifies the PIN at handover and ORBIT takes only commission', async () => {
    const customer = await login('student2@orbit.demo');
    const merchant = await login('suleiman@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Gate 2 Suya Spot', 'Suya wrap');
    const { id } = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 3 }], fulfilment: 'PICKUP' });

    const view = (await api().get(`/api/orders/${id}`).set(bearer(customer)).expect(200)).body;
    expect(view.total).toBe(5400); // no delivery fee
    expect(view.deliveryAddress).toBeNull();

    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(merchant)).send({}).expect(200);
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin: view.pin }).expect(409); // not ready yet
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(merchant)).expect(200);
    await api().post(`/api/merchant/orders/${id}/dispatch`).set(bearer(merchant)).expect(400); // not a delivery order
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin: view.pin }).expect(200);

    const t = await ledgerTotals(id);
    expect(t).toEqual({ merchant: 4968, courier: 0, platform: 432, all: 5400 });
  });

  it('merchant delivery: the shop keeps its own delivery fee and sees the address', async () => {
    const customer = await login('student2@orbit.demo');
    const merchant = await login('olayinka@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Handy Print and Stationery', 'Spiral binding');
    const { id } = await placeAndPay(customer, {
      shopId: shop.id, items: [{ productId: product.id, qty: 2 }], fulfilment: 'MERCHANT_DELIVERY', deliveryAddress: 'Faculty of Science, Lab 2',
    });
    const view = (await api().get(`/api/orders/${id}`).set(bearer(customer)).expect(200)).body;
    expect(view.deliveryFee).toBe(300);
    expect(view.total).toBe(1700);

    const mv = (await api().get('/api/merchant/orders').set(bearer(merchant)).expect(200)).body.find((o: { id: string }) => o.id === id);
    expect(mv.deliveryAddress).toBe('Faculty of Science, Lab 2');
    expect(mv.customer.phone).toBe('08031230101');

    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(merchant)).send({}).expect(200);
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(merchant)).expect(200);
    await api().post(`/api/merchant/orders/${id}/dispatch`).set(bearer(merchant)).expect(200);
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin: view.pin }).expect(200);

    const t = await ledgerTotals(id);
    expect(t).toEqual({ merchant: 1288 + 300, courier: 0, platform: 112, all: 1700 }); // 1,400 - 112 + 300 fee; 8% of 1,400 = 112
  });
});

// =====================================================================================================
describe('integrity under concurrency and abuse', () => {
  it('never oversells: of two simultaneous orders for the last units, exactly one succeeds', async () => {
    const a = await login('student@orbit.demo');
    const b = await login('student2@orbit.demo');
    const { shop, product } = await findProduct(a, 'Handy Print and Stationery', 'Scientific calculator'); // stock 8
    const body = { shopId: shop.id, items: [{ productId: product.id, qty: 5 }], fulfilment: 'PICKUP' };
    const results = await Promise.all([
      api().post('/api/orders').set(bearer(a)).send(body),
      api().post('/api/orders').set(bearer(b)).send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const stock = (await findProduct(a, 'Handy Print and Stationery', 'Scientific calculator')).product.stock;
    expect(stock).toBe(3);
  });

  it('lets exactly one rider win a job that two riders accept at the same moment', async () => {
    const customer = await login('student@orbit.demo');
    const merchant = await login('ibrahim@orbit.demo');
    const r1 = await login('rider1@orbit.demo');
    const r2 = await login('rider2@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Kano Provisions', 'Bottled water, 75cl');
    const { id } = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 2 }], fulfilment: 'ORBIT_COURIER', deliveryAddress: 'Hostel C' });
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(merchant)).send({}).expect(200);

    const results = await Promise.all([
      api().post(`/api/rider/jobs/${id}/claim`).set(bearer(r1)),
      api().post(`/api/rider/jobs/${id}/claim`).set(bearer(r2)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    // The winner can release it back; the job reappears on the board for the other rider.
    const winner = results[0].status === 200 ? r1 : r2;
    await api().post(`/api/rider/jobs/${id}/release`).set(bearer(winner)).expect(200);
    const board = (await api().get('/api/rider/jobs').set(bearer(r2)).expect(200)).body;
    expect(board.some((j: { id: string }) => j.id === id)).toBe(true);
  });

  it('keeps offline riders from accepting and unverified riders from working', async () => {
    const reg = await api().post('/api/auth/register')
      .send({ name: 'New Rider', email: 'newrider@example.com', phone: '08035550003', password: 'Strong123', role: 'RIDER', vehicle: 'BICYCLE' })
      .expect(201);
    await api().get('/api/rider/jobs').set(bearer(reg.body.token)).expect(403);
    const pending = await login('rider3@orbit.demo');
    await api().put('/api/rider/availability').set(bearer(pending)).send({ online: true }).expect(403);
  });

  it('locks an order after 5 wrong PINs and lets support unlock it', async () => {
    const customer = await login('student@orbit.demo');
    const merchant = await login('suleiman@orbit.demo');
    const admin = await login('admin@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Gate 2 Suya Spot', 'Kilishi');
    const { id } = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' });
    const pin = (await api().get(`/api/orders/${id}`).set(bearer(customer)).expect(200)).body.pin;
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(merchant)).send({}).expect(200);
    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(merchant)).expect(200);

    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 4; i++) await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin: wrong }).expect(400);
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin: wrong }).expect(423);
    // Even the right PIN is refused while locked.
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin }).expect(423);

    await api().post(`/api/admin/orders/${id}/unlock-pin`).set(bearer(admin)).expect(200);
    await api().post(`/api/merchant/orders/${id}/complete`).set(bearer(merchant)).send({ pin }).expect(200);
  });

  it('hides orders from everyone who is not a party to them (404, not 403)', async () => {
    const owner = await login('student@orbit.demo');
    const stranger = await login('student2@orbit.demo');
    const otherMerchant = await login('chinedu@orbit.demo');
    const { shop, product } = await findProduct(owner, 'Tech Corner Accessories', 'Phone case');
    const { id } = await placeAndPay(owner, { shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' });

    await api().get(`/api/orders/${id}`).set(bearer(stranger)).expect(404);
    await api().post(`/api/orders/${id}/cancel`).set(bearer(stranger)).send({}).expect(404);
    const wrongMerchant = await login('nkechi@orbit.demo');
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(wrongMerchant)).send({}).expect(404);
    await api().get(`/api/orders/${id}`).set(bearer(otherMerchant)).expect(200); // the shop owner can see it
    const mine = (await api().get('/api/orders').set(bearer(stranger)).expect(200)).body;
    expect(mine.some((o: { id: string }) => o.id === id)).toBe(false);
  });

  it('validates order input and ignores client-supplied prices', async () => {
    const customer = await login('student@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Tech Corner Accessories', 'Screen protector');
    const base = { shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' };
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [] }).expect(400);
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [{ productId: product.id, qty: 0 }] }).expect(400);
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [{ productId: product.id, qty: 99 }] }).expect(400);
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [{ productId: product.id, qty: 15 }, { productId: product.id, qty: 15 }] }).expect(400); // split lines are merged
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [{ productId: product.id, qty: 1, price: 1 }] }).expect(400); // no price field accepted
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, total: 1 }).expect(400);
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, fulfilment: 'ORBIT_COURIER' }).expect(400); // address required
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, shopId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    await api().post('/api/orders').set(bearer(customer)).send({ ...base, items: [{ productId: '00000000-0000-4000-8000-000000000000', qty: 1 }] }).expect(400);
  });
});

// =====================================================================================================
describe('cancellation, refunds and payment expiry', () => {
  it('refunds and restocks when the customer cancels before the shop confirms, but not after', async () => {
    const customer = await login('student@orbit.demo');
    const merchant = await login('hauwa@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Fresh Fruit Corner', 'Pineapple (whole)'); // stock 15
    const { id } = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 4 }], fulfilment: 'PICKUP' });
    expect((await findProduct(customer, 'Fresh Fruit Corner', 'Pineapple (whole)')).product.stock).toBe(11);

    await api().post(`/api/orders/${id}/cancel`).set(bearer(customer)).send({ reason: 'Changed my mind' }).expect(200);
    expect((await findProduct(customer, 'Fresh Fruit Corner', 'Pineapple (whole)')).product.stock).toBe(15);
    const payments = await db.getRepository(Payment).find({ where: { orderId: id } });
    expect(payments.map((p: { status: string }) => p.status)).toEqual(['REFUNDED']);
    await api().post(`/api/orders/${id}/cancel`).set(bearer(customer)).send({}).expect(409); // already cancelled

    // After confirmation, the customer can no longer cancel on their own.
    const second = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' });
    await api().post(`/api/merchant/orders/${second.id}/accept`).set(bearer(merchant)).send({}).expect(200);
    await api().post(`/api/orders/${second.id}/cancel`).set(bearer(customer)).send({}).expect(409);
    // The shop can cancel a confirmed order it cannot fulfil; the customer is refunded.
    await api().post(`/api/merchant/orders/${second.id}/cancel`).set(bearer(merchant)).send({ reason: 'Sold out' }).expect(200);
    const view = (await api().get(`/api/orders/${second.id}`).set(bearer(customer)).expect(200)).body;
    expect(view.status).toBe('CANCELLED');
    expect(view.cancelledBy).toBe('MERCHANT');
    expect(view.cancelReason).toBe('Sold out');
  });

  it('cancels unpaid orders after the payment window and releases the stock', async () => {
    const customer = await login('student@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Tech Corner Accessories', 'USB flash drive, 32GB'); // stock 18
    const created = await api().post('/api/orders').set(bearer(customer))
      .send({ shopId: shop.id, items: [{ productId: product.id, qty: 3 }], fulfilment: 'PICKUP' }).expect(201);
    expect((await findProduct(customer, 'Tech Corner Accessories', 'USB flash drive, 32GB')).product.stock).toBe(15);

    const cancelled = await app.get(OrdersService).expireStalePayments(new Date(Date.now() + 60 * 60_000));
    expect(cancelled).toBeGreaterThanOrEqual(1);
    expect((await findProduct(customer, 'Tech Corner Accessories', 'USB flash drive, 32GB')).product.stock).toBe(18);
    const view = (await api().get(`/api/orders/${created.body.order.id}`).set(bearer(customer)).expect(200)).body;
    expect(view.status).toBe('CANCELLED');

    // Money arriving after expiry is refunded, never silently kept.
    await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);
    const after = await db.getRepository(Payment).findOneByOrFail({ reference: created.body.payment.reference });
    expect(after.status).toBe('REFUNDED');
  });
});

// =====================================================================================================
describe('payment webhook security', () => {
  const secret = process.env.WEBHOOK_SECRET!;
  const sign = (body: string) => createHmac('sha256', secret).update(body).digest('hex');

  it('accepts only correctly signed events with the right amount, and is idempotent', async () => {
    const customer = await login('student@orbit.demo');
    const { shop, product } = await findProduct(customer, 'Kano Provisions', 'Milo sachet');
    const created = await api().post('/api/orders').set(bearer(customer))
      .send({ shopId: shop.id, items: [{ productId: product.id, qty: 5 }], fulfilment: 'PICKUP' }).expect(201);
    const { reference, amount } = created.body.payment;
    const id = created.body.order.id;

    const event = JSON.stringify({ event: 'charge.success', data: { reference, amount } });
    // No signature, wrong signature, tampered body.
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').send(event).expect(401);
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', 'deadbeef').send(event).expect(401);
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', sign(event))
      .send(event.replace(String(amount), '1')).expect(401);

    // Correctly signed but underpaid.
    const underpaid = JSON.stringify({ event: 'charge.success', data: { reference, amount: amount - 1 } });
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', sign(underpaid)).send(underpaid).expect(400);
    expect((await api().get(`/api/orders/${id}`).set(bearer(customer)).expect(200)).body.status).toBe('PENDING_PAYMENT');

    // Valid event, delivered twice (gateways retry).
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', sign(event)).send(event).expect(200);
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', sign(event)).send(event).expect(200);
    expect((await api().get(`/api/orders/${id}`).set(bearer(customer)).expect(200)).body.status).toBe('PLACED');

    // Unknown reference.
    const ghost = JSON.stringify({ event: 'charge.success', data: { reference: 'ORB_nope', amount: 1 } });
    await api().post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-orbit-signature', sign(ghost)).send(ghost).expect(404);
  });

  it('does not let one customer complete another customer’s payment', async () => {
    const owner = await login('student@orbit.demo');
    const stranger = await login('student2@orbit.demo');
    const { shop, product } = await findProduct(owner, 'Kano Provisions', 'Milo sachet');
    const created = await api().post('/api/orders').set(bearer(owner))
      .send({ shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' }).expect(201);
    await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(stranger)).send({ outcome: 'success' }).expect(404);
  });
});

// =====================================================================================================
describe('admin KPIs (proposal section 12)', () => {
  it('reports marketplace, logistics and financial figures consistent with the ledger', async () => {
    const admin = await login('admin@orbit.demo');
    const k = (await api().get('/api/admin/kpis').set(bearer(admin)).expect(200)).body;

    // Completed in earlier tests: courier order (6,400), pickup (5,400), merchant delivery (1,400), kilishi pickup (1,500).
    expect(k.marketplace.completedOrders).toBe(4);
    expect(k.marketplace.gmv).toBe(6400 + 5400 + 1400 + 1500);
    expect(k.marketplace.activeMerchants).toBeGreaterThanOrEqual(7); // 6 seeded + Bola Bites
    expect(k.logistics.courierDeliveries).toBe(1);
    expect(k.logistics.averageDeliveryMinutes).not.toBeNull();
    expect(k.financial.deliveryContribution).toBe(300);
    expect(k.financial.commission).toBe(512 + 432 + 112 + 120);
    expect(k.financial.platformRevenue).toBe(k.financial.commission + k.financial.deliveryContribution);

    // Money conservation: what is owed to everyone equals what customers paid for delivered orders.
    const paid = 7100 + 5400 + 1700 + 1500;
    expect(k.financial.owedToMerchants + k.financial.owedToRiders + k.financial.platformRevenue).toBe(paid);
    expect(k.marketplace.refundRatePct).toBeGreaterThan(0); // the cancellations above
  });
});

// =====================================================================================================
describe('realtime', () => {
  it('pushes a small change signal to the customer when their order moves, and rejects bad tokens', async () => {
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;

    const bad = connect(url, { auth: { token: 'garbage' }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => bad.on('disconnect', () => resolve()));
    bad.close();

    const customer = await login('student@orbit.demo');
    const merchant = await login('hauwa@orbit.demo');
    const socket = connect(url, { auth: { token: customer }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    const { shop, product } = await findProduct(customer, 'Fresh Fruit Corner', 'Oranges (6)');
    const { id } = await placeAndPay(customer, { shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'PICKUP' });

    const event = new Promise<{ orderId: string; status: string }>((resolve) => socket.on('order.updated', resolve));
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(merchant)).send({}).expect(200);
    const payload = await event;
    expect(payload).toEqual({ orderId: id, status: 'CONFIRMED' }); // ids and status only: no personal data
    socket.close();
  });
});
