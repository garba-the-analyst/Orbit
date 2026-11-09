/**
 * End-to-end tests for driver and haulier onboarding: vehicles, private documents, admin review, and the rules
 * that follow from them (go online only with an approved vehicle; heavy-goods vehicles do not take shop deliveries).
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
const png = (colour = '#334155') => sharp({ create: { width: 900, height: 600, channels: 3, background: colour } }).png().toBuffer();

async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  return (await api().post('/api/auth/login').send({ email, password }).expect(200)).body.token;
}

async function registerDriver(email: string, phone: string, extra: Record<string, unknown>) {
  const res = await api().post('/api/auth/register').send({ name: 'Test Driver', email, phone, password: 'Strong123', role: 'RIDER', ...extra }).expect(201);
  return res.body as { token: string; user: { id: string; fleet: string; vehicle: string; status: string } };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.get(SeedService).run();
});
afterAll(async () => { await app.close(); });

describe('driver and haulier onboarding', () => {
  let admin: string;
  let haulier: { token: string; user: { id: string } };
  let vehicleId: string;

  beforeAll(async () => { admin = await login('admin@orbit.demo'); });

  it('puts a truck owner in the heavy fleet and a car owner in the light fleet, with a pending vehicle each', async () => {
    haulier = await registerDriver('haul@example.com', '08031230811', { vehicle: 'TRUCK', plate: 'abc-123 xy', vehicleModel: 'Mack Granite', vehicleColor: 'White' });
    expect(haulier.user).toMatchObject({ fleet: 'HEAVY', vehicle: 'TRUCK', status: 'PENDING_VERIFICATION' });
    const cars = await registerDriver('car@example.com', '08031230812', { vehicle: 'CAR' });
    expect(cars.user.fleet).toBe('LIGHT');

    // Pending drivers can already manage their vehicle and see it waiting, even though other role routes are closed.
    const mine = (await api().get('/api/vehicles').set(bearer(haulier.token)).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: 'TRUCK', fleet: 'HEAVY', plate: 'ABC123XY', status: 'PENDING', isActive: true, capacityKg: 5000 });
    vehicleId = mine[0].id;
    await api().put('/api/rider/availability').set(bearer(haulier.token)).send({ online: true }).expect(403);
  });

  it('refuses a driver registering a vehicle for someone else’s role, a duplicate plate, bad plates and oversize loads', async () => {
    const customer = await login('student@orbit.demo');
    await api().get('/api/vehicles').set(bearer(customer)).expect(403);
    const add = (body: Record<string, unknown>) => api().post('/api/vehicles').set(bearer(haulier.token)).send(body);
    await add({ type: 'LORRY', plate: 'ABC123XY' }).expect(409); // same plate, even written differently
    await add({ type: 'LORRY', plate: '!!' }).expect(400);
    await add({ type: 'LORRY' }).expect(400); // plate needed
    await add({ type: 'SPACESHIP', plate: 'ZZZ999ZZ' }).expect(400);
    await add({ type: 'VAN', plate: 'VAN111AA', capacityKg: 99999 }).expect(400); // more than a van carries
    await add({ type: 'BICYCLE' }).expect(201); // bicycles need no plate
    await add({ type: 'LORRY', plate: 'LOR222BB', photos: ['https://evil.example/x.png'] }).expect(400); // photos must be your own uploads
  });

  it('accepts private documents by content, not by name, and keeps them from everyone except admins', async () => {
    const up = (kind: string, file: Buffer, name: string) => api().post(`/api/documents?kind=${kind}`).set(bearer(haulier.token)).attach('file', file, name);
    await up('DRIVER_LICENCE', Buffer.from('<script>alert(1)</script>'), 'licence.png').expect(400);
    await up('NONSENSE', await png(), 'a.png').expect(400);
    const img = (await up('DRIVER_LICENCE', await png(), 'licence.png').expect(201)).body;
    const pdf = (await up('VEHICLE_PAPERS', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj'), 'papers.pdf').expect(201)).body;
    expect(img).toMatchObject({ kind: 'DRIVER_LICENCE', status: 'PENDING', mime: 'image/jpeg' });
    expect(pdf.mime).toBe('application/pdf');
    expect(img.storageKey).toBeUndefined(); // the storage location never leaves the server

    const customer = await login('student@orbit.demo');
    await api().post('/api/documents?kind=ID_CARD').set(bearer(customer)).attach('file', await png(), 'x.png').expect(403);
    await api().get(`/api/admin/documents/${img.id}/file`).set(bearer(haulier.token)).expect(403); // not even the owner
    const file = await api().get(`/api/admin/documents/${img.id}/file`).set(bearer(admin)).expect(200);
    expect(file.headers['content-type']).toContain('image/jpeg');
    expect(file.headers['cache-control']).toContain('no-store');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    const pdfRes = await api().get(`/api/admin/documents/${pdf.id}/file`).set(bearer(admin)).expect(200);
    expect(pdfRes.headers['content-disposition']).toContain('attachment');

    // Nothing is reachable by URL guessing under the public uploads path.
    await api().get(`/uploads/${haulier.user.id}/anything.jpg`).expect(404);

    // The queue shows the admin the person's vehicles and documents together.
    const queue = (await api().get('/api/admin/queue').set(bearer(admin)).expect(200)).body;
    const entry = queue.riders.find((r: { userId: string }) => r.userId === haulier.user.id);
    expect(entry.fleet).toBe('HEAVY');
    expect(entry.vehicles[0].plate).toBe('ABC123XY');
    expect(entry.documents.map((d: { kind: string }) => d.kind).sort()).toEqual(['DRIVER_LICENCE', 'VEHICLE_PAPERS']);

    // A rejection must say why; the owner then sees it and can replace the document.
    await api().post(`/api/admin/documents/${img.id}/review`).set(bearer(admin)).send({ status: 'REJECTED' }).expect(400);
    await api().post(`/api/admin/documents/${img.id}/review`).set(bearer(admin)).send({ status: 'REJECTED', note: 'Licence is blurry' }).expect(200);
    const mine = (await api().get('/api/documents').set(bearer(haulier.token)).expect(200)).body;
    expect(mine.find((d: { id: string }) => d.id === img.id)).toMatchObject({ status: 'REJECTED', note: 'Licence is blurry' });
    await api().delete(`/api/documents/${img.id}`).set(bearer(haulier.token)).expect(200);
    await api().post(`/api/admin/documents/${pdf.id}/review`).set(bearer(admin)).send({ status: 'APPROVED' }).expect(200);
    await api().delete(`/api/documents/${pdf.id}`).set(bearer(haulier.token)).expect(409); // approved ones stay
  });

  it('approves the driver and their vehicle together; only then can they go online', async () => {
    await api().post(`/api/admin/users/${haulier.user.id}/approve`).set(bearer(admin)).expect(200);
    const mine = (await api().get('/api/vehicles').set(bearer(haulier.token)).expect(200)).body;
    expect(mine.find((v: { id: string }) => v.id === vehicleId)).toMatchObject({ status: 'APPROVED', isActive: true });
    await api().put('/api/rider/availability').set(bearer(haulier.token)).send({ online: true }).expect(200);
  });

  it('keeps heavy-goods vehicles off the shop-delivery board and out of claims', async () => {
    const board = (await api().get('/api/rider/jobs').set(bearer(haulier.token)).expect(200)).body;
    expect(board).toEqual([]);

    const customer = await login('student@orbit.demo');
    const owner = await login('hauwa@orbit.demo');
    const shops = (await api().get('/api/shops').set(bearer(customer)).expect(200)).body;
    const shop = shops.find((s: { name: string }) => s.name.includes('Fresh Fruit'));
    const product = (await api().get(`/api/shops/${shop.id}`).set(bearer(customer)).expect(200)).body.products[0];
    const created = await api().post('/api/orders').set(bearer(customer)).send({
      shopId: shop.id, items: [{ productId: product.id, qty: 1 }], fulfilment: 'ORBIT_COURIER', deliveryAddress: '1 Test Street, Kano',
    }).expect(201);
    await api().post(`/api/payments/${created.body.payment.reference}/simulate`).set(bearer(customer)).send({ outcome: 'success' }).expect(200);
    await api().post(`/api/merchant/orders/${created.body.order.id}/accept`).set(bearer(owner)).send({}).expect(200);
    await api().post(`/api/rider/jobs/${created.body.order.id}/claim`).set(bearer(haulier.token)).expect(409);
    // A light-fleet driver still can.
    const bike = await login('rider1@orbit.demo');
    await api().post(`/api/rider/jobs/${created.body.order.id}/claim`).set(bearer(bike)).expect(200);
  });

  it('sends a vehicle back for review when its plate changes, and takes the driver offline', async () => {
    await api().patch(`/api/vehicles/${vehicleId}`).set(bearer(haulier.token)).send({ color: 'Blue' }).expect(200); // harmless edit
    expect((await api().get('/api/vehicles').set(bearer(haulier.token)).expect(200)).body[0].status).toBe('APPROVED');
    const changed = await api().patch(`/api/vehicles/${vehicleId}`).set(bearer(haulier.token)).send({ plate: 'NEW999ZZ' }).expect(200);
    expect(changed.body.status).toBe('PENDING');
    expect((await api().get('/api/me').set(bearer(haulier.token)).expect(200)).body.online).toBe(false);
    await api().put('/api/rider/availability').set(bearer(haulier.token)).send({ online: true }).expect(409);
  });

  it('lets an admin reject a vehicle with a reason, and the driver fix and resubmit it', async () => {
    const queue = (await api().get('/api/admin/vehicles').set(bearer(admin)).expect(200)).body;
    const v = queue.find((x: { id: string }) => x.id === vehicleId);
    expect(v.ownerName).toBe('Test Driver');
    await api().post(`/api/admin/vehicles/${vehicleId}/reject`).set(bearer(admin)).send({}).expect(400);
    await api().post(`/api/admin/vehicles/${vehicleId}/reject`).set(bearer(admin)).send({ note: 'Plate does not match the papers' }).expect(200);
    expect((await api().get('/api/vehicles').set(bearer(haulier.token)).expect(200)).body[0]).toMatchObject({ status: 'REJECTED', reviewNote: 'Plate does not match the papers' });
    await api().patch(`/api/vehicles/${vehicleId}`).set(bearer(haulier.token)).send({ plate: 'NEW999ZZ' }).expect(200); // editing resubmits
    await api().post(`/api/admin/vehicles/${vehicleId}/approve`).set(bearer(admin)).expect(200);
    await api().put('/api/rider/availability').set(bearer(haulier.token)).send({ online: true }).expect(200);
    await api().post(`/api/admin/vehicles/${vehicleId}/approve`).set(bearer(haulier.token)).expect(403);
  });

  it('does not let a drivers switch vehicles while online, and activates only approved ones', async () => {
    const list = (await api().get('/api/vehicles').set(bearer(haulier.token)).expect(200)).body;
    const bicycle = list.find((v: { type: string }) => v.type === 'BICYCLE');
    if (bicycle) {
      await api().post(`/api/vehicles/${bicycle.id}/activate`).set(bearer(haulier.token)).expect(409); // not approved yet
      await api().post(`/api/admin/vehicles/${bicycle.id}/approve`).set(bearer(admin)).expect(200);
      await api().post(`/api/vehicles/${bicycle.id}/activate`).set(bearer(haulier.token)).expect(409); // still online
      await api().put('/api/rider/availability').set(bearer(haulier.token)).send({ online: false }).expect(200);
      const active = (await api().post(`/api/vehicles/${bicycle.id}/activate`).set(bearer(haulier.token)).expect(200)).body;
      expect(active.isActive).toBe(true);
      expect((await api().get('/api/me').set(bearer(haulier.token)).expect(200)).body).toMatchObject({ vehicle: 'BICYCLE', fleet: 'LIGHT' });
    }
  });
});
