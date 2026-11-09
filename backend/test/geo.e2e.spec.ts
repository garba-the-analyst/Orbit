/**
 * End-to-end tests for maps, saved places, driver location and live tracking. The test environment runs routing
 * offline (no network), so these check the contract and the fallback; parsing of real OSRM answers is covered by
 * the unit spec with a faked network.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';

let app: INestApplication;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (email: string) => (await api().post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200)).body.token as string;

const LAGOS = { lat: 6.5244, lng: 3.3792 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.get(SeedService).run();
});
afterAll(async () => { await app.close(); });

describe('maps', () => {
  it('returns a route with distance, time, path and steps, and says honestly that it is an estimate', async () => {
    const t = await login('student@orbit.demo');
    const r = (await api().get('/api/geo/route').query({ fromLat: LAGOS.lat, fromLng: LAGOS.lng, toLat: IKEJA.lat, toLng: IKEJA.lng, vehicle: 'MOTORCYCLE' }).set(bearer(t)).expect(200)).body;
    expect(r.source).toBe('estimate');
    expect(r.distanceM).toBeGreaterThan(10_000);
    expect(r.durationS).toBeGreaterThan(0);
    expect(r.geometry[0]).toEqual([LAGOS.lat, LAGOS.lng]);
    expect(r.steps.at(-1).instruction).toBe('You have arrived');
  });

  it('rejects points outside the served countries, bad numbers, missing fields, unknown vehicles and anonymous callers', async () => {
    const t = await login('student@orbit.demo');
    const get = (q: Record<string, unknown>) => api().get('/api/geo/route').query(q).set(bearer(t));
    await get({ fromLat: 51.5, fromLng: -0.12, toLat: IKEJA.lat, toLng: IKEJA.lng }).expect(400); // London
    await get({ fromLat: 999, fromLng: 3, toLat: 6, toLng: 3 }).expect(400);
    await get({ fromLat: 6.5 }).expect(400);
    await get({ fromLat: LAGOS.lat, fromLng: LAGOS.lng, toLat: IKEJA.lat, toLng: IKEJA.lng, vehicle: 'ROCKET' }).expect(400);
    await api().get('/api/geo/route').query({ fromLat: 6.5, fromLng: 3.3, toLat: 6.6, toLng: 3.4 }).expect(401);
  });

  it('answers place search with an empty list (not an error) when search is offline', async () => {
    const t = await login('student@orbit.demo');
    const r = (await api().get('/api/geo/search').query({ q: 'Ikeja City Mall' }).set(bearer(t)).expect(200)).body;
    expect(r).toEqual({ online: false, results: [] });
    await api().get('/api/geo/search').query({ q: 'ab' }).set(bearer(t)).expect(400);
  });
});

describe('saved places', () => {
  it('saves, replaces by label, lists privately, caps at 20, validates and deletes', async () => {
    const ada = await login('student@orbit.demo');
    const bola = await login('student2@orbit.demo');
    const home = (await api().post('/api/places').set(bearer(ada)).send({ label: 'Home', address: '12 Allen Avenue, Ikeja', ...IKEJA }).expect(201)).body;
    await api().post('/api/places').set(bearer(ada)).send({ label: 'Home', address: '14 Allen Avenue, Ikeja', ...IKEJA }).expect(201); // replaces
    const mine = (await api().get('/api/places').set(bearer(ada)).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0].address).toBe('14 Allen Avenue, Ikeja');
    expect((await api().get('/api/places').set(bearer(bola)).expect(200)).body).toEqual([]);

    await api().post('/api/places').set(bearer(ada)).send({ label: 'Abroad', address: 'London', lat: 51.5, lng: -0.12 }).expect(400);
    await api().post('/api/places').set(bearer(ada)).send({ label: '', address: 'x', ...IKEJA }).expect(400);
    for (let i = 0; i < 19; i++) await api().post('/api/places').set(bearer(ada)).send({ label: `Spot ${i}`, address: 'Somewhere in Lagos', ...LAGOS }).expect(201);
    await api().post('/api/places').set(bearer(ada)).send({ label: 'One too many', address: 'Somewhere in Lagos', ...LAGOS }).expect(400);

    await api().delete(`/api/places/${home.id}`).set(bearer(bola)).expect(200); // someone else's id changes nothing
    expect((await api().get('/api/places').set(bearer(ada)).expect(200)).body).toHaveLength(20);
    await api().delete(`/api/places/${home.id}`).set(bearer(ada)).expect(200);
    expect((await api().get('/api/places').set(bearer(ada)).expect(200)).body).toHaveLength(19);
  });
});

describe('driver location and live tracking of an order', () => {
  it('shows the customer their driver’s position, plate and route, and nobody else', async () => {
    await app.listen(0);
    const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const customer = await login('student@orbit.demo');
    const other = await login('student2@orbit.demo');
    const owner = await login('nkechi@orbit.demo');
    const rider = await login('rider1@orbit.demo');
    const stranger = await login('rider2@orbit.demo');

    // The shop is on the map; the customer pins the drop-off.
    await api().patch('/api/merchant/shop').set(bearer(owner)).send({ lat: LAGOS.lat, lng: LAGOS.lng, city: 'Lagos' }).expect(200);
    const shops = (await api().get('/api/shops').set(bearer(customer)).expect(200)).body;
    const shop = shops.find((s: { name: string }) => s.name.includes('Nkechi'));
    const product = (await api().get(`/api/shops/${shop.id}`).set(bearer(customer)).expect(200)).body.products[0];
    const created = await api().post('/api/orders').set(bearer(customer)).send({
      shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'ORBIT_COURIER', deliveryAddress: '12 Allen Avenue, Ikeja', deliveryLat: IKEJA.lat, deliveryLng: IKEJA.lng,
    }).expect(201);
    const id = created.body.order.id;
    await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);
    await api().post(`/api/merchant/orders/${id}/accept`).set(bearer(owner)).send({}).expect(200);

    // Before anyone claims it there is nothing to track.
    expect((await api().get(`/api/orders/${id}/tracking`).set(bearer(customer)).expect(200)).body.active).toBe(false);
    await api().post(`/api/rider/jobs/${id}/claim`).set(bearer(rider)).expect(200);

    // Positions are validated, and only drivers may send them.
    await api().put('/api/rider/location').set(bearer(customer)).send(LAGOS).expect(403);
    await api().put('/api/rider/location').set(bearer(rider)).send({ lat: 51.5, lng: -0.1 }).expect(400);
    await api().put('/api/rider/location').set(bearer(rider)).send({ lat: 6.5, lng: 3.3, heading: 400 }).expect(400);

    // The customer's open app receives the moving dot, tagged with the order.
    const socket = connect(url, { auth: { token: customer }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => { socket.on('connect', () => resolve()); socket.on('connect_error', reject); });
    const moved = new Promise<Record<string, unknown>>((resolve) => socket.on('courier.moved', resolve));
    const spy = connect(url, { auth: { token: other }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => spy.on('connect', () => resolve()));
    let leaked = false;
    spy.on('courier.moved', () => { leaked = true; });

    await api().put('/api/rider/location').set(bearer(rider)).send({ lat: 6.55, lng: 3.37, heading: 20 }).expect(200);
    expect(await moved).toMatchObject({ orderId: id, lat: 6.55, lng: 3.37, heading: 20 });
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false); // another customer never receives it
    socket.close(); spy.close();

    // Phase one: heading to the shop. Then, once collected, heading to the customer.
    const toShop = (await api().get(`/api/orders/${id}/tracking`).set(bearer(customer)).expect(200)).body;
    expect(toShop).toMatchObject({ active: true, phase: 'to_shop', courier: { lat: 6.55, lng: 3.37, name: 'Abdul' }, vehicle: { type: 'MOTORCYCLE', plate: 'KJA123AA' } });
    expect(toShop.route.distanceM).toBeGreaterThan(0);
    expect(toShop.route.steps).toBeUndefined(); // turn-by-turn is for the driver
    expect(toShop.destination).toMatchObject({ lat: LAGOS.lat, lng: LAGOS.lng });

    await api().post(`/api/merchant/orders/${id}/ready`).set(bearer(owner)).expect(200);
    await api().post(`/api/rider/jobs/${id}/pickup`).set(bearer(rider)).expect(200);
    const toYou = (await api().get(`/api/orders/${id}/tracking`).set(bearer(customer)).expect(200)).body;
    expect(toYou).toMatchObject({ active: true, phase: 'to_you', destination: IKEJA });

    await api().get(`/api/orders/${id}/tracking`).set(bearer(other)).expect(404);
    await api().get(`/api/orders/${id}/tracking`).set(bearer(stranger)).expect(404); // a driver with no part in it learns nothing
  });
});
