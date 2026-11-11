/**
 * Security tests (Section C of the agent handoff brief).
 *
 * These run against the real Nest application (same guards, pipes and headers as production)
 * on an in-memory SQLite database, driven over HTTP. Each test targets a specific hard rule:
 *
 *   - IDOR: a user can never read or modify another user's order, trip or document
 *   - mustChangePassword: a temporary-password holder is gated everywhere except /me and /me/password
 *   - password-version revocation: an old JWT stops working after a password change
 *   - uploads: non-image files are rejected (content, not filename, is trusted)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';

let app: INestApplication;
let db: DataSource;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.token;
}

let nextPhone = 0;
async function registerCustomer(email: string): Promise<{ token: string; id: string }> {
  nextPhone += 1;
  const res = await api()
    .post('/api/auth/register')
    .send({
      name: 'Security Tester',
      email,
      phone: `0803${String(nextPhone).padStart(7, '0')}`,
      password: 'Strong123',
      role: 'CUSTOMER',
      acceptTerms: true,
    })
    .expect(201);
  return { token: res.body.token, id: res.body.user.id };
}

async function placeOrder(token: string): Promise<string> {
  const shops = (await api().get('/api/shops').set(bearer(token)).expect(200)).body;
  const shop = shops[0];
  const detail = (await api().get(`/api/shops/${shop.id}`).set(bearer(token)).expect(200)).body;
  const product = detail.products.find((p: { stock: number }) => p.stock > 0);
  const created = await api()
    .post('/api/orders')
    .set(bearer(token))
    .send({
      shopId: shop.id,
      items: [{ productId: product.id, qty: 1 }],
      fulfilment: 'PICKUP',
    })
    .expect(201);
  await api()
    .post(`/api/payments/${created.body.payment.reference}/simulate`)
    .set(bearer(token))
    .send({ outcome: 'success' })
    .expect(200);
  return created.body.order.id;
}

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

describe('IDOR: a user cannot touch another user\'s resources', () => {
  it('customer A cannot read customer B\'s order', async () => {
    const { token: tokenA } = await registerCustomer('ida@example.com');
    const { token: tokenB } = await registerCustomer('idb@example.com');
    const orderId = await placeOrder(tokenA);

    // Customer B's request for customer A's order looks like it does not exist.
    await api().get(`/api/orders/${orderId}`).set(bearer(tokenB)).expect(404);
    await api().post(`/api/orders/${orderId}/cancel`).set(bearer(tokenB)).expect(404);
    await api().post(`/api/orders/${orderId}/rate`).set(bearer(tokenB)).send({ rating: 5 }).expect(404);
  });

  it('customer A cannot read customer B\'s trip', async () => {
    const { token: tokenA } = await registerCustomer('idc@example.com');
    const { token: tokenB } = await registerCustomer('idd@example.com');

    // Book a ride as customer A (quote then create).
    const shops = (await api().get('/api/shops').set(bearer(tokenA)).expect(200)).body;
    const quote = await api()
      .post('/api/trips/quote')
      .set(bearer(tokenA))
      .send({
        kind: 'RIDE',
        pickup: { lat: 9.0765, lng: 7.3986, address: 'Jabi Lake, Abuja' },
        drop: { lat: 9.0710, lng: 7.4960, address: 'Wuse 2, Abuja' },
      })
      .expect(200);
    const option = quote.body.options?.[0] ?? quote.body.option;
    const created = await api()
      .post('/api/trips')
      .set(bearer(tokenA))
      .send({
        kind: 'RIDE',
        pickup: { lat: 9.0765, lng: 7.3986, address: 'Jabi Lake, Abuja' },
        drop: { lat: 9.0710, lng: 7.4960, address: 'Wuse 2, Abuja' },
        vehicleType: 'CAR',
        paymentMethod: 'CASH',
        acceptedSurge: option.surge ?? 1,
      })
      .expect(201);
    const tripId = created.body.id;

    // Customer B cannot see the trip.
    await api().get(`/api/trips/${tripId}`).set(bearer(tokenB)).expect(404);
  });
});

describe('mustChangePassword gating', () => {
  it('a temporary-password admin is blocked everywhere except /me and /me/password', async () => {
    const superadmin = await login('root@orbit.test', 'Root@2026test');

    // Create a new admin (gets a temporary password, mustChangePassword = true).
    const created = await api()
      .post('/api/admin/admins')
      .set(bearer(superadmin))
      .send({
        name: 'Temp Admin',
        email: 'tempadmin@example.com',
        phone: '08035550009',
        password: 'TempStrong123',
      })
      .expect(201);
    const adminId = created.body.id;

    // Sign in as the temp admin.
    const tempToken = await login('tempadmin@example.com', 'TempStrong123');

    // /me is allowed while a password change is pending.
    await api().get('/api/me').set(bearer(tempToken)).expect(200);

    // Everything else is blocked until the password is changed.
    await api().patch('/api/me').set(bearer(tempToken)).send({ name: 'Changed' }).expect(403);

    // Change the password — this revokes every older token.
    await api()
      .post('/api/me/password')
      .set(bearer(tempToken))
      .send({ currentPassword: 'TempStrong123', newPassword: 'NewStrong123' })
      .expect(200);

    // The old token is revoked (pv mismatch) → 401, not 403.
    await api().patch('/api/me').set(bearer(tempToken)).send({ name: 'Changed' }).expect(401);

    // With a fresh token, the profile update works.
    const fresh = await login('tempadmin@example.com', 'NewStrong123');
    await api().patch('/api/me').set(bearer(fresh)).send({ name: 'Changed' }).expect(200);

    // Clean up: the superadmin removes the temp admin.
    await api().delete(`/api/admin/admins/${adminId}`).set(bearer(superadmin)).expect(200);
  });

  it('password change revokes the old JWT (pv revocation)', async () => {
    const superadmin = await login('root@orbit.test', 'Root@2026test');
    const created = await api()
      .post('/api/admin/admins')
      .set(bearer(superadmin))
      .send({
        name: 'Revocation Tester',
        email: 'revoke@example.com',
        phone: '08035550010',
        password: 'OldStrong123',
      })
      .expect(201);
    const adminId = created.body.id;

    const oldToken = await login('revoke@example.com', 'OldStrong123');
    // Change the password.
    await api()
      .post('/api/me/password')
      .set(bearer(oldToken))
      .send({ currentPassword: 'OldStrong123', newPassword: 'NewStrong123' })
      .expect(200);

    // The old token no longer works.
    await api().get('/api/me').set(bearer(oldToken)).expect(401);

    // A fresh token works.
    const fresh = await login('revoke@example.com', 'NewStrong123');
    await api().get('/api/me').set(bearer(fresh)).expect(200);

    await api().delete(`/api/admin/admins/${adminId}`).set(bearer(superadmin)).expect(200);
  });
});

describe('uploads: content, not filename, is trusted', () => {
  it('rejects a non-image file', async () => {
    const token = await login('student@orbit.demo', DEMO_PASSWORD);
    await api()
      .post('/api/uploads?kind=avatar')
      .set(bearer(token))
      .attach('file', Buffer.from('not an image at all'), 'evil.php')
      .expect(400);
  });
});
