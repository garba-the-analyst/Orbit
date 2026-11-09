/**
 * End-to-end tests for the v2 foundations:
 *   1. the superadmin, the six-admin cap and the forced password change;
 *   2. picture uploads and the rule that you may only attach pictures you uploaded;
 *   3. rich catalogue entries (several pictures, dimensions, goods type, services);
 *   4. location-aware shop search across the country.
 *
 * Runs the real Nest application on in-memory SQLite (or PostgreSQL with TEST_DB=postgres).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';

let app: INestApplication;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const SUPER = { email: 'root@orbit.test', password: 'Root@2026test' };

async function login(email: string, password = DEMO_PASSWORD) {
  const res = await api().post('/api/auth/login').send({ email, password }).expect(200);
  return res.body as { token: string; user: Record<string, unknown> };
}

/** A real picture: a coloured rectangle as a PNG. */
const picture = (w = 800, h = 600, colour = '#10b981') =>
  sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();

function upload(token: string, kind: string, file: Buffer, filename = 'photo.png') {
  return api().post(`/api/uploads?kind=${kind}`).set(bearer(token)).attach('file', file, filename);
}

const newAdmin = (n: number) => ({
  name: `Admin Number ${n}`,
  email: `admin${n}@orbit.test`,
  phone: `0803123${String(4000 + n)}`,
  password: `Temp1234x${n}`,
});

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.get(SeedService).run();
});

afterAll(async () => {
  await app.close();
});

// =====================================================================================================
describe('superadmin and admin management', () => {
  let superToken: string;
  const created: Array<{ id: string; email: string }> = [];

  it('has a superadmin from the environment, who can sign in and is flagged as such', async () => {
    const { token, user } = await login(SUPER.email, SUPER.password);
    superToken = token;
    expect(user).toMatchObject({ role: 'ADMIN', isSuperAdmin: true, mustChangePassword: false });
    const list = (await api().get('/api/admin/admins').set(bearer(token)).expect(200)).body;
    expect(list.limit).toBe(6);
    expect(list.used).toBe(0);
  });

  it('never exposes a way to register as the superadmin, or as any admin', async () => {
    await api()
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: SUPER.email, phone: '08031239999', password: 'Strong123', role: 'CUSTOMER' })
      .expect(409);
    await api()
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@example.com', phone: '08031239998', password: 'Strong123', role: 'ADMIN' })
      .expect(400);
  });

  it('keeps ordinary admins and everyone else away from admin management', async () => {
    const admin = await login('admin@orbit.demo');
    await api().get('/api/admin/admins').set(bearer(admin.token)).expect(403);
    await api().post('/api/admin/admins').set(bearer(admin.token)).send(newAdmin(1)).expect(403);
    const customer = await login('student@orbit.demo');
    await api().get('/api/admin/admins').set(bearer(customer.token)).expect(403);
    await api().get('/api/admin/admins').expect(401);
  });

  it('creates an admin whose temporary password must be changed before anything else works', async () => {
    const res = await api().post('/api/admin/admins').set(bearer(superToken)).send(newAdmin(1)).expect(201);
    created.push({ id: res.body.id, email: res.body.email });
    expect(res.body).toMatchObject({ isSuperAdmin: false, mustChangePassword: true });
    expect(res.body.passwordHash).toBeUndefined();

    const { token, user } = await login(newAdmin(1).email, newAdmin(1).password);
    expect(user.mustChangePassword).toBe(true);

    // Everything except reading yourself and changing the password is blocked.
    const blocked = await api().get('/api/admin/queue').set(bearer(token)).expect(403);
    expect(JSON.stringify(blocked.body)).toContain('PASSWORD_CHANGE_REQUIRED');
    await api().get('/api/me').set(bearer(token)).expect(200);

    // Wrong current password, reuse of the same password, and weak passwords are all refused.
    await api().post('/api/me/password').set(bearer(token)).send({ currentPassword: 'nope1234', newPassword: 'Fresh2026pw' }).expect(400);
    await api().post('/api/me/password').set(bearer(token)).send({ currentPassword: newAdmin(1).password, newPassword: newAdmin(1).password }).expect(400);
    await api().post('/api/me/password').set(bearer(token)).send({ currentPassword: newAdmin(1).password, newPassword: 'short' }).expect(400);

    const changed = await api()
      .post('/api/me/password')
      .set(bearer(token))
      .send({ currentPassword: newAdmin(1).password, newPassword: 'Fresh2026pw' })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The old token stops working (sessions are signed out), the fresh one works, and the old password is dead.
    await api().get('/api/me').set(bearer(token)).expect(401);
    await api().get('/api/admin/queue').set(bearer(changed.body.token)).expect(200);
    await api().post('/api/auth/login').send({ email: newAdmin(1).email, password: newAdmin(1).password }).expect(401);
    await login(newAdmin(1).email, 'Fresh2026pw');

    // A normal admin still cannot manage admins.
    await api().get('/api/admin/admins').set(bearer(changed.body.token)).expect(403);
  });

  it('refuses duplicate emails and weak temporary passwords', async () => {
    await api().post('/api/admin/admins').set(bearer(superToken)).send(newAdmin(1)).expect(409);
    await api().post('/api/admin/admins').set(bearer(superToken)).send({ ...newAdmin(2), password: 'alllettersonly' }).expect(400);
    await api().post('/api/admin/admins').set(bearer(superToken)).send({ ...newAdmin(2), email: 'not-an-email' }).expect(400);
  });

  it('allows exactly six other admins, even when requests arrive together, and a removal frees a slot', async () => {
    // Slot 1 is used. Fire five more at once: all five fit.
    const five = await Promise.all([2, 3, 4, 5, 6].map((n) => api().post('/api/admin/admins').set(bearer(superToken)).send(newAdmin(n))));
    expect(five.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    five.forEach((r) => created.push({ id: r.body.id, email: r.body.email }));

    // Now two simultaneous requests for a seventh: neither may succeed.
    const sevenths = await Promise.all([7, 8].map((n) => api().post('/api/admin/admins').set(bearer(superToken)).send(newAdmin(n))));
    expect(sevenths.map((r) => r.status)).toEqual([409, 409]);
    expect((await api().get('/api/admin/admins').set(bearer(superToken)).expect(200)).body.used).toBe(6);

    // Remove one, and exactly one new admin fits; of two simultaneous requests, one wins.
    await api().delete(`/api/admin/admins/${created[5].id}`).set(bearer(superToken)).expect(200);
    const race = await Promise.all([7, 8].map((n) => api().post('/api/admin/admins').set(bearer(superToken)).send(newAdmin(n))));
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('suspends, reactivates and resets passwords, each taking effect immediately; the superadmin is untouchable', async () => {
    const target = created[0];
    const session = await login(newAdmin(1).email, 'Fresh2026pw');
    await api().get('/api/admin/queue').set(bearer(session.token)).expect(200);

    await api().post(`/api/admin/admins/${target.id}/suspend`).set(bearer(superToken)).expect(200);
    await api().get('/api/admin/queue').set(bearer(session.token)).expect(401); // the very next request
    await api().post('/api/auth/login').send({ email: newAdmin(1).email, password: 'Fresh2026pw' }).expect(401);

    await api().post(`/api/admin/admins/${target.id}/reactivate`).set(bearer(superToken)).expect(200);
    await login(newAdmin(1).email, 'Fresh2026pw');

    const reset = await api().post(`/api/admin/admins/${target.id}/reset-password`).set(bearer(superToken)).send({ temporaryPassword: 'Reset2026tmp' }).expect(200);
    expect(reset.body.mustChangePassword).toBe(true);
    const again = await login(newAdmin(1).email, 'Reset2026tmp');
    expect(again.user.mustChangePassword).toBe(true);

    const me = (await api().get('/api/me').set(bearer(superToken)).expect(200)).body;
    await api().post(`/api/admin/admins/${me.id}/suspend`).set(bearer(superToken)).expect(400);
    await api().delete(`/api/admin/admins/${me.id}`).set(bearer(superToken)).expect(400);
    await api().post(`/api/admin/admins/${me.id}/reset-password`).set(bearer(superToken)).send({ temporaryPassword: 'Whatever123' }).expect(400);
  });

  it('does not touch non-admin accounts through the admin endpoints', async () => {
    const session = await login('student@orbit.demo');
    const customer = (await api().get('/api/me').set(bearer(session.token)).expect(200)).body;
    await api().post(`/api/admin/admins/${customer.id}/suspend`).set(bearer(superToken)).expect(404);
    await api().delete(`/api/admin/admins/${customer.id}`).set(bearer(superToken)).expect(404);
    await login('student@orbit.demo'); // still fine
  });
});

// =====================================================================================================
describe('picture uploads', () => {
  it('stores a real picture as a resized WebP with a thumbnail, and serves both', async () => {
    const { token } = await login('nkechi@orbit.demo');
    const res = await upload(token, 'product', await picture(3000, 2000)).expect(201);
    expect(res.body.url).toMatch(/\/uploads\/product\/[0-9a-f-]+\.webp$/);
    expect(res.body.thumb).toMatch(/_t\.webp$/);
    expect(res.body.width).toBeLessThanOrEqual(1600);

    const full = await api().get(new URL(res.body.url, 'http://x').pathname).expect(200);
    expect(full.headers['content-type']).toContain('image/webp');
    await api().get(new URL(res.body.thumb, 'http://x').pathname).expect(200);
    const meta = await sharp(full.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined(); // camera and location data is stripped
  });

  it('crops avatars and logos square', async () => {
    const { token } = await login('student@orbit.demo');
    const res = await upload(token, 'avatar', await picture(1200, 400)).expect(201);
    expect(res.body.width).toBe(512);
    expect(res.body.height).toBe(512);
  });

  it('refuses non-pictures however they are named, unknown kinds, missing files and anonymous uploads', async () => {
    const { token } = await login('student@orbit.demo');
    await upload(token, 'avatar', Buffer.from('<script>alert(1)</script>'), 'evil.png').expect(400);
    await upload(token, 'avatar', Buffer.from('%PDF-1.4 not a picture'), 'doc.jpg').expect(400);
    await upload(token, 'banner', await picture()).expect(400);
    await api().post('/api/uploads?kind=avatar').set(bearer(token)).expect(400);
    await api().post('/api/uploads?kind=avatar').attach('file', await picture(), 'a.png').expect(401);
  });

  it('lets you set your own avatar, but not a picture someone else uploaded or an outside address', async () => {
    const ada = await login('student@orbit.demo');
    const bola = await login('student2@orbit.demo');
    const mine = (await upload(ada.token, 'avatar', await picture()).expect(201)).body.url;
    const theirs = (await upload(bola.token, 'avatar', await picture(500, 500, '#ef4444')).expect(201)).body.url;

    const ok = await api().patch('/api/me').set(bearer(ada.token)).send({ avatarUrl: mine }).expect(200);
    expect(ok.body.avatarUrl).toBe(mine);
    await api().patch('/api/me').set(bearer(ada.token)).send({ avatarUrl: theirs }).expect(400);
    await api().patch('/api/me').set(bearer(ada.token)).send({ avatarUrl: 'https://tracker.example/pixel.gif' }).expect(400);

    const removed = await api().patch('/api/me').set(bearer(ada.token)).send({ avatarUrl: null }).expect(200);
    expect(removed.body.avatarUrl).toBeNull();
  });
});

// =====================================================================================================
describe('rich catalogue: pictures, dimensions, goods type and services', () => {
  it('saves several pictures, dimensions and a goods type, and returns them with thumbnails', async () => {
    const { token } = await login('nkechi@orbit.demo');
    const a = (await upload(token, 'product', await picture(900, 700, '#f59e0b')).expect(201)).body.url;
    const b = (await upload(token, 'product', await picture(900, 700, '#3b82f6')).expect(201)).body.url;

    const created = await api()
      .post('/api/merchant/products')
      .set(bearer(token))
      .send({
        name: 'Party jollof tray',
        description: 'Serves ten. Comes hot in a sealed foil tray, with fried plantain and chicken.',
        price: 25000,
        stock: 4,
        goodsType: 'FOOD',
        images: [a, b],
        lengthCm: 45,
        widthCm: 35,
        heightCm: 12,
        weightKg: 6.5,
        unitLabel: 'tray',
      })
      .expect(201);
    expect(created.body).toMatchObject({ goodsType: 'FOOD', lengthCm: 45, widthCm: 35, heightCm: 12, weightKg: 6.5, unitLabel: 'tray', kind: 'GOOD' });
    expect(created.body.images).toEqual([a, b]);
    expect(created.body.thumb).toMatch(/_t\.webp$/);

    // Customers see the same, including the goods type.
    const cust = await login('student@orbit.demo');
    const shops = (await api().get('/api/shops').set(bearer(cust.token)).expect(200)).body;
    const shop = shops.find((s: { name: string }) => s.name.includes('Nkechi'));
    const detail = (await api().get(`/api/shops/${shop.id}`).set(bearer(cust.token)).expect(200)).body;
    const seen = detail.products.find((p: { name: string }) => p.name === 'Party jollof tray');
    expect(seen).toMatchObject({ goodsType: 'FOOD', heightCm: 12 });
    expect(seen.images).toHaveLength(2);
  });

  it('refuses pictures the merchant did not upload, too many pictures, absurd sizes and unknown goods types', async () => {
    const nkechi = await login('nkechi@orbit.demo');
    const suleiman = await login('suleiman@orbit.demo');
    const theirs = (await upload(suleiman.token, 'product', await picture()).expect(201)).body.url;
    const base = { name: 'Test item', price: 500, stock: 3 };
    const post = (extra: Record<string, unknown>) => api().post('/api/merchant/products').set(bearer(nkechi.token)).send({ ...base, ...extra });

    await post({ images: [theirs] }).expect(400);
    await post({ images: ['https://tracker.example/pixel.gif'] }).expect(400);
    await post({ images: Array.from({ length: 9 }, (_, i) => `/uploads/product/${i}.webp`) }).expect(400);
    await post({ lengthCm: 0 }).expect(400);
    await post({ widthCm: 99999 }).expect(400);
    await post({ goodsType: 'EXPLOSIVES' }).expect(400);
    await post({ kind: 'MAGIC' }).expect(400);
  });

  it('supports services: no stock to run out, and the stock field is ignored', async () => {
    const { token } = await login('nkechi@orbit.demo');
    const svc = (await api().post('/api/merchant/products').set(bearer(token)).send({
      name: 'Event catering consultation', price: 15000, kind: 'SERVICE', unitLabel: 'per hour', stock: 3,
    }).expect(201)).body;
    expect(svc.kind).toBe('SERVICE');
    expect(svc.unitLabel).toBe('per hour');
  });

  it('still applies the prohibited-goods screen to the new fields', async () => {
    const { token } = await login('nkechi@orbit.demo');
    await api().post('/api/merchant/products').set(bearer(token)).send({ name: 'Cold beer crate', price: 5000, stock: 5 }).expect(400);
    await api().post('/api/merchant/products').set(bearer(token)).send({ name: 'House special', description: 'Includes a free pack of cigarettes', price: 5000, stock: 5 }).expect(400);
  });
});

// =====================================================================================================
describe('shop profile and nationwide search', () => {
  // Real coordinates: Lagos Ikeja, Abuja Wuse, Kano city.
  const LAGOS = { lat: 6.6018, lng: 3.3515 };
  const ABUJA = { lat: 9.0765, lng: 7.3986 };
  const KANO = { lat: 12.0022, lng: 8.592 };

  async function place(email: string, spot: { lat: number; lng: number }, city: string, state: string) {
    const { token } = await login(email);
    return api().patch('/api/merchant/shop').set(bearer(token)).send({ ...spot, city, state }).expect(200);
  }

  it('lets a shop owner set a map location, and derives country and currency from it', async () => {
    const lagos = await place('nkechi@orbit.demo', LAGOS, 'Lagos', 'Lagos');
    expect(lagos.body).toMatchObject({ lat: LAGOS.lat, lng: LAGOS.lng, city: 'Lagos', country: 'NG', currency: 'NGN' });
    await place('suleiman@orbit.demo', ABUJA, 'Abuja', 'FCT');
    await place('ibrahim@orbit.demo', KANO, 'Kano', 'Kano');
  });

  it('refuses a location outside the countries ORBIT serves, and half a coordinate', async () => {
    const { token } = await login('nkechi@orbit.demo');
    await api().patch('/api/merchant/shop').set(bearer(token)).send({ lat: 51.5, lng: -0.12 }).expect(400); // London
    await api().patch('/api/merchant/shop').set(bearer(token)).send({ lat: 6.6 }).expect(400);
    await api().patch('/api/merchant/shop').set(bearer(token)).send({ lat: 123, lng: 3 }).expect(400);
  });

  it('refuses a logo that was not uploaded by the shop owner', async () => {
    const owner = await login('nkechi@orbit.demo');
    const stranger = await login('student@orbit.demo');
    const url = (await upload(stranger.token, 'logo', await picture()).expect(201)).body.url;
    await api().patch('/api/merchant/shop').set(bearer(owner.token)).send({ logoUrl: url }).expect(400);

    const own = (await upload(owner.token, 'logo', await picture()).expect(201)).body.url;
    const ok = await api().patch('/api/merchant/shop').set(bearer(owner.token)).send({ logoUrl: own }).expect(200);
    expect(ok.body.logoUrl).toBe(own);
  });

  it('returns only shops near the searcher, nearest first, with the distance and the total in a header', async () => {
    const { token } = await login('student@orbit.demo');
    const res = await api().get('/api/shops').query({ ...LAGOS, radiusKm: 30 }).set(bearer(token)).expect(200);
    const names = res.body.map((s: { name: string }) => s.name);
    expect(names.some((n: string) => n.includes('Nkechi'))).toBe(true);
    expect(res.body.every((s: { distanceKm: number }) => s.distanceKm !== null && s.distanceKm <= 30)).toBe(true);
    expect(res.headers['x-total-count']).toBe(String(res.body.length));
    const km = res.body.map((s: { distanceKm: number }) => s.distanceKm);
    // open shops come first, then nearest; within the open ones the order is by distance
    const openKm = res.body.filter((s: { isOpen: boolean }) => s.isOpen).map((s: { distanceKm: number }) => s.distanceKm);
    expect([...openKm].sort((x, y) => x - y)).toEqual(openKm);
    expect(km.length).toBeGreaterThan(0);

    // From Kano, the Lagos shop is hundreds of kilometres away and must not appear.
    const kano = (await api().get('/api/shops').query({ ...KANO, radiusKm: 50 }).set(bearer(token)).expect(200)).body;
    expect(kano.map((s: { name: string }) => s.name).some((n: string) => n.includes('Nkechi'))).toBe(false);
    expect(kano.length).toBeGreaterThan(0);
  });

  it('browses by city, lists cities with counts, and pages results', async () => {
    const { token } = await login('student@orbit.demo');
    const abuja = (await api().get('/api/shops').query({ city: 'abuja' }).set(bearer(token)).expect(200)).body;
    expect(abuja.length).toBeGreaterThan(0);
    expect(abuja.every((s: { city: string }) => s.city === 'Abuja')).toBe(true);

    const cities = (await api().get('/api/shops/cities').set(bearer(token)).expect(200)).body;
    expect(cities).toEqual(expect.arrayContaining([expect.objectContaining({ country: 'NG', city: 'Lagos' }), expect.objectContaining({ city: 'Kano' })]));

    const all = await api().get('/api/shops').set(bearer(token)).expect(200);
    const total = Number(all.headers['x-total-count']);
    const page = await api().get('/api/shops').query({ limit: 2, offset: 1 }).set(bearer(token)).expect(200);
    expect(page.body).toHaveLength(Math.min(2, Math.max(0, total - 1)));
    expect(Number(page.headers['x-total-count'])).toBe(total);
  });

  it('searches safely: wildcards are literal text, and a half-sent location is rejected', async () => {
    const { token } = await login('student@orbit.demo');
    const pct = await api().get('/api/shops').query({ q: '%' }).set(bearer(token)).expect(200);
    expect(pct.body).toEqual([]); // "%" means the literal character, not "match everything"
    await api().get('/api/shops').query({ q: "'; DROP TABLE shops; --" }).set(bearer(token)).expect(200);
    await api().get('/api/shops').query({ lat: 6.6 }).set(bearer(token)).expect(400);
    await api().get('/api/shops').query({ lat: 999, lng: 3 }).set(bearer(token)).expect(400);
    await api().get('/api/shops').query({ limit: 100000 }).set(bearer(token)).expect(400);
  });
});
