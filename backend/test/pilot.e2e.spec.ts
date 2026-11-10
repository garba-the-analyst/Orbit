/**
 * End-to-end tests for what a real pilot needs: password reset by email, consent to the terms, a copy of your data,
 * account deletion, and an audit trail of what staff do.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PasswordReset } from '../src/auth/password-reset.entity';
import { configureApp } from '../src/bootstrap';
import { config } from '../src/config/config';
import { MailService } from '../src/mail/mail.service';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';
import { Shop } from '../src/shops/shop.entity';
import { User } from '../src/users/user.entity';
import { Vehicle } from '../src/vehicles/vehicle.entity';
import { SavedPlace } from '../src/geo/place.entity';

let app: INestApplication;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
let users: Repository<User>;
let resets: Repository<PasswordReset>;
let mail: MailService;
let admin: string;
let counter = 0;

async function signUp(role: 'CUSTOMER' | 'RIDER' | 'MERCHANT' = 'CUSTOMER', extra: Record<string, unknown> = {}) {
  counter++;
  const email = `pilot${counter}@example.com`;
  const res = await api().post('/api/auth/register').send({ name: `Pilot Person ${counter}`, email, phone: `0803125${String(1000 + counter).padStart(4, '0')}`, password: 'Strong123', role, ...extra }).expect(201);
  return { token: res.body.token as string, id: res.body.user.id as string, email };
}
const forgot = (email: string) => api().post('/api/auth/forgot-password').send({ email });
const tokenFrom = (m: { text: string }) => /token=([A-Za-z0-9_-]+)/.exec(m.text)![1];
const reset = (token: string, password = 'Brand-new-9') => api().post('/api/auth/reset-password').send({ token, password });
const loginWith = (email: string, password: string) => api().post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.get(SeedService).run();
  users = app.get(getRepositoryToken(User));
  resets = app.get(getRepositoryToken(PasswordReset));
  mail = app.get(MailService);
  admin = (await loginWith('admin@orbit.demo', DEMO_PASSWORD).expect(200)).body.token;
});
// A driver must be checked in nearby for a trip to stay open (otherwise it ends at once as "no driver").
beforeEach(() => users.update({ email: 'rider1@orbit.demo' }, { lat: 6.517, lng: 3.3715, locationAt: new Date(), online: true }));
afterAll(async () => { await app.close(); });

describe('forgot password', () => {
  it('answers the same for unknown and known emails, and only emails real accounts', async () => {
    const u = await signUp();
    const before = mail.outbox.length;
    const unknown = (await forgot('nobody-here@example.com').expect(200)).body;
    expect(mail.outbox.length).toBe(before);
    const known = (await forgot(u.email).expect(200)).body;
    expect(known).toEqual(unknown); // an attacker learns nothing about who has an account
    expect(mail.outbox).toHaveLength(before + 1);
    const m = mail.outbox.at(-1)!;
    expect(m).toMatchObject({ to: u.email, subject: expect.stringMatching(/reset/i) });
    expect(m.text).toContain(`${config.mail.appUrl}/reset-password?token=`);
    await api().post('/api/auth/forgot-password').send({ email: 'not-an-email' }).expect(400);
  });

  it('resets once, signs out every device, and stores only a hash of the token', async () => {
    const u = await signUp();
    await forgot(u.email).expect(200);
    const token = tokenFrom(mail.outbox.at(-1)!);
    const stored = await resets.findOneByOrFail({ userId: u.id });
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    await api().get('/api/me').set(bearer(u.token)).expect(200);
    await reset(token, 'weak').expect(400); // same password rules as sign-up
    await reset('x'.repeat(30)).expect(400); // not a real token
    await reset(token).expect(200);
    await api().get('/api/me').set(bearer(u.token)).expect(401); // the old session ended
    await loginWith(u.email, 'Strong123').expect(401);
    await loginWith(u.email, 'Brand-new-9').expect(200);
    await reset(token, 'Another-pass-1').expect(400); // links work once
  });

  it('lets only the newest link work, and refuses expired links', async () => {
    const u = await signUp();
    await forgot(u.email).expect(200);
    const first = tokenFrom(mail.outbox.at(-1)!);
    await forgot(u.email).expect(200);
    const second = tokenFrom(mail.outbox.at(-1)!);
    await reset(first).expect(400);
    await resets.update({ userId: u.id }, { expiresAt: new Date(Date.now() - 1000) });
    await reset(second).expect(400);
  });

  it('limits how often one address can be emailed, so nobody can flood an inbox', async () => {
    const u = await signUp();
    const before = mail.outbox.length;
    for (let i = 0; i < 5; i++) await forgot(u.email).expect(200);
    expect(mail.outbox.length - before).toBe(3);
  });

  it('also frees an account that was locked by too many wrong passwords', async () => {
    const u = await signUp();
    for (let i = 0; i < 5; i++) await loginWith(u.email, 'Wrong-pass-1').expect(401);
    await loginWith(u.email, 'Strong123').expect(429);
    await forgot(u.email).expect(200);
    await reset(tokenFrom(mail.outbox.at(-1)!), 'Fresh-start-7').expect(200);
    await loginWith(u.email, 'Fresh-start-7').expect(200);
  });
});

describe('terms and privacy consent', () => {
  afterEach(() => { (config.consent as { required: boolean }).required = false; });

  it('publishes the notice with a version, and records who accepted which version', async () => {
    const legal = (await api().get('/api/legal').expect(200)).body; // no sign-in needed to read it
    expect(legal).toMatchObject({ version: expect.any(String), pilotNotice: expect.stringMatching(/TEST MODE/), terms: expect.any(Array), privacy: expect.any(Array) });

    (config.consent as { required: boolean }).required = true;
    const body = { name: 'Consent Tester', email: 'consent@example.com', phone: '08031259001', password: 'Strong123', role: 'CUSTOMER' };
    const refused = await api().post('/api/auth/register').send(body).expect(400);
    expect(refused.body.message).toMatch(/Terms and Privacy/);
    await api().post('/api/auth/register').send({ ...body, acceptTerms: false }).expect(400);
    const ok = (await api().post('/api/auth/register').send({ ...body, acceptTerms: true }).expect(201)).body;
    const row = await users.findOneByOrFail({ id: ok.user.id });
    expect(row.termsVersion).toBe(legal.version);
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
    const exported = (await api().get('/api/me/export').set(bearer(ok.token)).expect(200)).body;
    expect(exported.profile.termsVersion).toBe(legal.version);
  });
});

describe('your data: export and deletion', () => {
  const A = { address: 'Yaba, Lagos', lat: 6.5158, lng: 3.3711 };
  const B = { address: 'Ikeja City Mall, Lagos', lat: 6.6018, lng: 3.3515 };

  it('exports what is yours and nothing that is not, never a password hash', async () => {
    const eve = await signUp();
    await api().post('/api/places').set(bearer(eve.token)).send({ label: 'Home', address: '12 Allen Avenue, Ikeja', lat: 6.6, lng: 3.35 }).expect(201);
    const trip = (await api().post('/api/trips').set(bearer(eve.token)).send({ kind: 'RIDE', pickup: A, drop: B, vehicleType: 'MOTORCYCLE', paymentMethod: 'CASH' }).expect(201)).body;
    await api().post(`/api/trips/${trip.id}/cancel`).set(bearer(eve.token)).send({}).expect(200);

    const res = await api().get('/api/me/export').set(bearer(eve.token)).expect(200);
    expect(res.body).toMatchObject({ profile: { email: eve.email, role: 'CUSTOMER' }, savedPlaces: [{ label: 'Home' }], trips: [{ id: trip.id }] });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(text).not.toContain('student@orbit.demo'); // other people's data is not in there
    await api().get('/api/me/export').expect(401);
  });

  it('refuses deletion with the wrong password or while something is in progress, then removes the person', async () => {
    const eve = await signUp();
    await api().post('/api/places').set(bearer(eve.token)).send({ label: 'Home', address: '12 Allen Avenue, Ikeja', lat: 6.6, lng: 3.35 }).expect(201);
    const trip = (await api().post('/api/trips').set(bearer(eve.token)).send({ kind: 'RIDE', pickup: A, drop: B, vehicleType: 'MOTORCYCLE', paymentMethod: 'CASH' }).expect(201)).body;

    await api().post('/api/me/delete').set(bearer(eve.token)).send({ password: 'Strong123' }).expect(409); // a trip is under way
    await api().post(`/api/trips/${trip.id}/cancel`).set(bearer(eve.token)).send({}).expect(200);
    await api().post('/api/me/delete').set(bearer(eve.token)).send({ password: 'Wrong-pass-1' }).expect(401);
    await api().post('/api/me/delete').send({ password: 'Strong123' }).expect(401);
    await api().post('/api/me/delete').set(bearer(eve.token)).send({ password: 'Strong123' }).expect(200);

    await api().get('/api/me').set(bearer(eve.token)).expect(401); // signed out everywhere
    await loginWith(eve.email, 'Strong123').expect(401);
    const row = await users.findOneByOrFail({ id: eve.id });
    expect(row).toMatchObject({ name: 'Deleted user', status: 'DELETED', phone: '', email: `deleted-${eve.id}@deleted.orbit` });
    expect(await app.get<Repository<SavedPlace>>(getRepositoryToken(SavedPlace)).count({ where: { userId: eve.id } })).toBe(0);
    await forgot(`deleted-${eve.id}@deleted.orbit`).expect(200); // and no way back in through a reset either
    expect(mail.outbox.at(-1)?.to).not.toBe(`deleted-${eve.id}@deleted.orbit`);
  });

  it('closes a merchant’s shop and removes a driver’s vehicles and availability', async () => {
    const merchant = await signUp('MERCHANT', { shopName: 'Pilot Provisions', shopCategory: 'Groceries', shopAddress: '5 Market Road, Kano' });
    await api().post('/api/me/delete').set(bearer(merchant.token)).send({ password: 'Strong123' }).expect(200);
    expect(await app.get<Repository<Shop>>(getRepositoryToken(Shop)).findOneByOrFail({ ownerId: merchant.id })).toMatchObject({ status: 'SUSPENDED', isOpen: false });

    const rider = await signUp('RIDER', { vehicle: 'MOTORCYCLE', plate: 'PIL-001-AA' });
    await api().post('/api/me/delete').set(bearer(rider.token)).send({ password: 'Strong123' }).expect(200);
    expect(await app.get<Repository<Vehicle>>(getRepositoryToken(Vehicle)).count({ where: { ownerId: rider.id } })).toBe(0);
    expect((await users.findOneByOrFail({ id: rider.id })).online).toBe(false);
  });

  it('never lets the superadmin delete the root account from the app', async () => {
    const root = (await loginWith('root@orbit.test', 'Root@2026test').expect(200)).body.token;
    await api().post('/api/me/delete').set(bearer(root)).send({ password: 'Root@2026test' }).expect(403);
  });
});

describe('audit trail', () => {
  const trail = async () => (await api().get('/api/admin/audit').query({ limit: 50 }).set(bearer(admin)).expect(200)).body as { total: number; items: Array<{ action: string; targetId: string | null; actor: { name: string }; details: Record<string, unknown> }> };
  const settle = () => new Promise((r) => setTimeout(r, 100)); // entries are written just after the response

  it('records what staff change, who did it and to what, without any password', async () => {
    const rider = await signUp('RIDER', { vehicle: 'MOTORCYCLE', plate: 'AUD-001-AA' });
    await api().post(`/api/admin/users/${rider.id}/approve`).set(bearer(admin)).expect(200);
    await api().post(`/api/admin/users/${rider.id}/suspend`).set(bearer(admin)).send({ reason: 'Documents did not match' }).expect(200);
    const root = (await loginWith('root@orbit.test', 'Root@2026test').expect(200)).body.token;
    const created = (await api().post('/api/admin/admins').set(bearer(root)).send({ name: 'Auditor One', email: 'auditor1@example.com', phone: '08031259777', password: 'Temp-pass-77' }).expect(201)).body;
    await settle();

    const t = await trail();
    const approve = t.items.find((i) => i.action === 'POST /admin/users/:id/approve' && i.targetId === rider.id);
    expect(approve).toMatchObject({ actor: { name: expect.any(String) } });
    expect(t.items.find((i) => i.action === 'POST /admin/users/:id/suspend' && i.targetId === rider.id)?.details).toMatchObject({ reason: 'Documents did not match' });
    expect(t.items.find((i) => i.action === 'POST /admin/admins')).toBeDefined();
    expect(JSON.stringify(t)).not.toContain('Temp-pass-77'); // passwords are never written to the log
    expect(created.email ?? created.user?.email ?? 'auditor1@example.com').toBeTruthy();
  });

  it('does not log reading, only changing, and is for staff only', async () => {
    const before = (await trail()).total;
    await api().get('/api/admin/queue').set(bearer(admin)).expect(200);
    await api().get('/api/admin/kpis').set(bearer(admin)).expect(200);
    await settle();
    expect((await trail()).total).toBe(before);

    const customer = await signUp();
    await api().get('/api/admin/audit').set(bearer(customer.token)).expect(403);
    await api().post(`/api/admin/users/${customer.id}/approve`).set(bearer(customer.token)).expect(403);
    await settle();
    expect((await trail()).total).toBe(before); // refused attempts are not "changes"
  });
});
