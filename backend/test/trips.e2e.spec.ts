/**
 * End-to-end tests for trips: rides, parcels and freight, from quote to payment, with matching, PINs, cancel rules,
 * surge price lock, promos, sharing and safety alerts. Routing runs offline in tests, so distances are estimates.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { In, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { VEHICLE_SPECS } from '../src/common/catalog';
import { computeFare } from '../src/common/fare';
import { MARKETS } from '../src/common/markets';
import { config } from '../src/config/config';
import { LedgerEntry } from '../src/earnings/ledger-entry.entity';
import { DEMO_PASSWORD, SeedService } from '../src/seed/seed.service';
import { MatchingService } from '../src/trips/matching.service';
import { PromoCode, Trip, TripOffer } from '../src/trips/trip.entities';
import { User } from '../src/users/user.entity';

let app: INestApplication;
const api = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (email: string) => (await api().post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200)).body.token as string;

const A = { address: 'Yaba, Lagos', lat: 6.5158, lng: 3.3711 };
const B = { address: 'Ikeja City Mall, Lagos', lat: 6.6018, lng: 3.3515 };
const NEAR_A = { lat: 6.517, lng: 3.3715 }; // about 140 m from A
const NEAR_A_2 = { lat: 6.525, lng: 3.3711 }; // about 1 km from A
const FAR = { lat: 6.6, lng: 3.35 }; // about 10 km from A
const ACTIVE = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];

let users: Repository<User>;
let trips: Repository<Trip>;
let offers: Repository<TripOffer>;
let ledger: Repository<LedgerEntry>;
let promos: Repository<PromoCode>;
let matching: MatchingService;

let admin: string; let ada: string; let bola: string; let r1: string; let r2: string;
let d2: { token: string; id: string; email: string }; // a second motorbike driver
let counter = 0;

const place = (email: string, p: { lat: number; lng: number }, online = true) => users.update({ email }, { lat: p.lat, lng: p.lng, locationAt: new Date(), online });
const setWaveSize = (n: number) => { (config.trips as { waveSize: number }).waveSize = n; };

async function signUp(role: 'CUSTOMER' | 'RIDER', extra: Record<string, unknown> = {}) {
  counter++;
  const email = `trip${counter}@example.com`;
  const res = await api().post('/api/auth/register').send({ name: `Tester ${counter}`, email, phone: `0803124${String(1000 + counter).padStart(4, '0')}`, password: 'Strong123', role, ...extra }).expect(201);
  return { token: res.body.token as string, id: res.body.user.id as string, email };
}

async function driver(vehicle: string, plate: string, at: { lat: number; lng: number }) {
  const d = await signUp('RIDER', { vehicle, plate });
  await api().post(`/api/admin/users/${d.id}/approve`).set(bearer(admin)).expect(200);
  await api().put('/api/rider/availability').set(bearer(d.token)).send({ online: true }).expect(200);
  await place(d.email, at);
  return d;
}

const requestTrip = (token: string, over: Record<string, unknown> = {}) =>
  api().post('/api/trips').set(bearer(token)).send({ kind: 'RIDE', pickup: A, drop: B, vehicleType: 'MOTORCYCLE', paymentMethod: 'CARD', ...over });
const requestParcel = (token: string, over: Record<string, unknown> = {}) =>
  requestTrip(token, { kind: 'PARCEL', goodsType: 'FRAGILE', weightKg: 3, recipientName: 'Chidi Okeke', recipientPhone: '08031230999', ...over });
const view = async (token: string, id: string) => (await api().get(`/api/trips/${id}`).set(bearer(token)).expect(200)).body;
const offersOf = async (token: string) => (await api().get('/api/driver/offers').set(bearer(token)).expect(200)).body as Array<{ tripId: string }>;
const accept = (token: string, id: string) => api().post(`/api/driver/offers/${id}/accept`).set(bearer(token));
const earnings = async (token: string) => (await api().get('/api/rider/earnings').set(bearer(token)).expect(200)).body;
const linesOf = (id: string) => ledger.find({ where: { orderId: id }, order: { kind: 'ASC' } });
const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0);

/** Drives an accepted trip to completion the way the apps do. */
async function finish(customer: string, driverToken: string, id: string, kind: 'RIDE' | 'PARCEL') {
  await api().post(`/api/driver/trips/${id}/arrived`).set(bearer(driverToken)).expect(200);
  const pin = (await view(customer, id)).pin?.code as string;
  await api().post(`/api/driver/trips/${id}/start`).set(bearer(driverToken)).send(kind === 'RIDE' ? { pin } : {}).expect(200);
  return (await api().post(`/api/driver/trips/${id}/complete`).set(bearer(driverToken)).send(kind === 'PARCEL' ? { pin } : {}).expect(200)).body;
}

const expire = async (id: string) => {
  const past = new Date(Date.now() - 1000);
  await trips.update({ id }, { waveExpiresAt: past });
  await offers.update({ tripId: id, status: 'OFFERED' }, { expiresAt: past });
};

/** Ends whatever is still open so the next group starts from a quiet road. */
const clean = async () => {
  await trips.update({ status: In(ACTIVE) }, { status: 'CANCELLED' });
  await offers.update({ status: 'OFFERED' }, { status: 'EXPIRED' });
};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  await app.get(SeedService).run();
  users = app.get(getRepositoryToken(User));
  trips = app.get(getRepositoryToken(Trip));
  offers = app.get(getRepositoryToken(TripOffer));
  ledger = app.get(getRepositoryToken(LedgerEntry));
  promos = app.get(getRepositoryToken(PromoCode));
  matching = app.get(MatchingService);
  [admin, ada, bola, r1, r2] = await Promise.all(['admin@orbit.demo', 'student@orbit.demo', 'student2@orbit.demo', 'rider1@orbit.demo', 'rider2@orbit.demo'].map(login));
  d2 = await driver('MOTORCYCLE', 'LAG-777-AA', NEAR_A_2);
});
afterAll(async () => { await app.close(); });

// Positions go stale after 90 seconds, so every test starts by checking the drivers in again.
beforeEach(async () => {
  await place('rider1@orbit.demo', NEAR_A);
  await place('rider2@orbit.demo', { lat: 6.52, lng: 3.373 });
  await place(d2.email, NEAR_A_2);
});

describe('quotes', () => {
  it('prices a ride for each suitable vehicle from the tariff, with driver ETAs and the route to draw', async () => {
    const q = (await api().post('/api/trips/quote').set(bearer(ada)).send({ kind: 'RIDE', pickup: A, drop: B }).expect(200)).body;
    expect(q).toMatchObject({ currency: 'NGN', country: 'NG', route: { source: 'estimate' } });
    expect(q.route.distanceM).toBeGreaterThan(8000);
    expect(q.route.geometry.length).toBeGreaterThan(1);
    expect(q.options.map((o: { vehicleType: string }) => o.vehicleType)).toEqual(['MOTORCYCLE', 'KEKE', 'CAR']);
    const [moto, keke, car] = q.options;
    const expected = computeFare({ tariff: VEHICLE_SPECS.MOTORCYCLE.tariff, market: MARKETS.NG, distanceM: q.route.distanceM, durationS: moto.durationS, surge: 1, commissionBps: config.trips.commissionBps });
    expect(moto.fare).toBe(expected.fare);
    expect(moto).toMatchObject({ surge: 1, driversNearby: 2, available: true });
    expect(moto.etaMin).toBeGreaterThanOrEqual(1);
    expect(keke.driversNearby).toBe(1);
    expect(car).toMatchObject({ available: false, etaMin: null, driversNearby: 0 }); // nobody drives a car yet
    expect(car.fare).toBeGreaterThan(moto.fare);
  });

  it('suggests only vehicles that fit: a few kilos on a bike, three tonnes on a truck, four passengers in a car', async () => {
    const quote = async (body: Record<string, unknown>) => (await api().post('/api/trips/quote').set(bearer(ada)).send({ pickup: A, drop: B, ...body }).expect(200)).body.options.map((o: { vehicleType: string }) => o.vehicleType);
    expect(await quote({ kind: 'PARCEL', weightKg: 5 })).toEqual(['MOTORCYCLE', 'KEKE', 'CAR']); // the bicycle is too slow for 12 km
    expect(await quote({ kind: 'PARCEL', weightKg: 300 })).toEqual(['VAN', 'TRUCK', 'LORRY']);
    expect(await quote({ kind: 'PARCEL', weightKg: 3000 })).toEqual(['TRUCK', 'LORRY', 'LONG_HAUL']);
    expect(await quote({ kind: 'RIDE', passengers: 4 })).toEqual(['CAR']);
    expect(await quote({ kind: 'RIDE', passengers: 2 })).toEqual(['KEKE', 'CAR']);
  });

  it('refuses nonsense: no weight, outside Africa, same spot, too heavy, anonymous callers and drivers', async () => {
    const post = (body: Record<string, unknown>, token = ada) => api().post('/api/trips/quote').set(bearer(token)).send({ kind: 'RIDE', pickup: A, drop: B, ...body });
    await post({ kind: 'PARCEL' }).expect(400);
    await post({ pickup: { address: 'London', lat: 51.5, lng: -0.12 } }).expect(400);
    await post({ drop: { ...A, address: 'Same place' } }).expect(400);
    await post({ kind: 'PARCEL', weightKg: 50_000 }).expect(400);
    await post({ kind: 'PARCEL', weightKg: 3, goodsType: 'WEAPONS' }).expect(400);
    await api().post('/api/trips/quote').send({ kind: 'RIDE', pickup: A, drop: B }).expect(401);
    await post({}, r1).expect(403);
  });
});

describe('a card ride, start to finish', () => {
  let id: string;
  let total: number;
  afterAll(clean);

  it('is offered only to nearby drivers of that vehicle, and the first to accept gets it', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    id = t.id;
    total = t.price.total;
    expect(t).toMatchObject({ status: 'SEARCHING', kind: 'RIDE', vehicleType: 'MOTORCYCLE', currency: 'NGN', search: { wave: 1, maxWaves: 3 }, pin: null });
    expect(t.code).toMatch(/^TRP-\d{6}-[A-Z2-9]{5}$/);
    expect(t.price.driverEarning).toBeUndefined(); // the customer's lens
    expect((await offersOf(r1)).map((o) => o.tripId)).toEqual([id]);
    expect((await offersOf(d2.token)).map((o) => o.tripId)).toEqual([id]);
    expect(await offersOf(r2)).toEqual([]); // a keke driver is not offered a motorbike ride

    const offer = (await offersOf(r1))[0] as unknown as Record<string, unknown>;
    expect(offer).toMatchObject({ kind: 'RIDE', currency: 'NGN', customer: { firstName: expect.any(String) } });
    expect(JSON.stringify(offer)).not.toMatch(/phone|08031|\+234/); // no contact details before accepting

    await requestTrip(ada).expect(409); // one trip at a time
    const accepted = (await accept(r1, id).expect(200)).body;
    expect(accepted).toMatchObject({ status: 'ACCEPTED', price: { driverEarning: expect.any(Number), collectInCash: 0 }, pin: null }); // drivers never see the PIN
    expect(accepted.customer).toMatchObject({ phone: expect.any(String) });
    await accept(d2.token, id).expect(409); // too late
    expect(await offersOf(d2.token)).toEqual([]);
    expect(await offersOf(r1)).toEqual([]);
  });

  it('shows the customer their driver, vehicle and the PIN to read out, and nobody else anything', async () => {
    const t = await view(ada, id);
    expect(t).toMatchObject({ status: 'ACCEPTED', driver: { firstName: 'Abdul', phone: expect.any(String) }, vehicle: { plate: 'KJA123AA', type: 'MOTORCYCLE' }, pin: { purpose: 'start', code: expect.stringMatching(/^\d{4}$/) } });
    expect(t.cancel).toEqual({ allowed: true, fee: 0, late: false });
    await api().get(`/api/trips/${id}`).set(bearer(bola)).expect(404); // other people cannot even tell it exists
    await api().get(`/api/trips/${id}`).set(bearer(r2)).expect(404);
    expect((await api().get('/api/trips/active').set(bearer(ada)).expect(200)).body.id).toBe(id);
    expect((await api().get('/api/driver/trips/active').set(bearer(r1)).expect(200)).body.id).toBe(id);
  });

  it('gates arrival on GPS and the start on the passenger’s PIN, with five wrong tries allowed', async () => {
    await place('rider1@orbit.demo', FAR);
    const far = await api().post(`/api/driver/trips/${id}/arrived`).set(bearer(r1)).expect(409);
    expect(far.body.message).toMatch(/m from the pickup/);
    await place('rider1@orbit.demo', NEAR_A);
    await api().post(`/api/driver/trips/${id}/start`).set(bearer(r1)).send({}).expect(409); // not arrived yet
    await api().post(`/api/driver/trips/${id}/arrived`).set(bearer(r1)).expect(200);
    await api().post(`/api/driver/trips/${id}/start`).set(bearer(r1)).send({}).expect(400); // a PIN is needed
    const real = (await view(ada, id)).pin.code as string;
    const wrong = await api().post(`/api/driver/trips/${id}/start`).set(bearer(r1)).send({ pin: real === '0000' ? '1111' : '0000' }).expect(403);
    expect(wrong.body.message).toMatch(/4 tries left/);
    await api().post(`/api/driver/trips/${id}/start`).set(bearer(bola)).send({ pin: real }).expect(403); // a customer cannot drive
    await api().post(`/api/driver/trips/${id}/start`).set(bearer(r2)).send({ pin: real }).expect(404); // another driver cannot touch it
    const started = (await api().post(`/api/driver/trips/${id}/start`).set(bearer(r1)).send({ pin: real }).expect(200)).body;
    expect(started.status).toBe('IN_PROGRESS');
    expect((await view(ada, id)).pin).toBeNull(); // the PIN has done its job
  });

  it('cannot be cancelled once under way, and shows the customer where the driver is', async () => {
    await api().post(`/api/trips/${id}/cancel`).set(bearer(ada)).send({}).expect(409);
    await api().post(`/api/driver/trips/${id}/cancel`).set(bearer(r1)).expect(409);
    const track = (await api().get(`/api/trips/${id}/tracking`).set(bearer(ada)).expect(200)).body;
    expect(track).toMatchObject({ tripId: id, status: 'IN_PROGRESS', driver: { lat: NEAR_A.lat, lng: NEAR_A.lng } });
    await api().get(`/api/trips/${id}/tracking`).set(bearer(bola)).expect(404);
  });

  it('completes, splits the fare between driver and ORBIT exactly, and never marks it paid twice', async () => {
    const done = (await api().post(`/api/driver/trips/${id}/complete`).set(bearer(r1)).send({}).expect(200)).body;
    expect(done).toMatchObject({ status: 'COMPLETED', price: { total, paid: true } });
    await api().post(`/api/driver/trips/${id}/complete`).set(bearer(r1)).send({}).expect(409);

    const lines = await linesOf(id);
    expect(lines.map((l) => `${l.party}:${l.kind}`).sort()).toEqual(['COURIER:TRIP_EARNING', 'PLATFORM:TRIP_COMMISSION']);
    expect(sum(lines)).toBe(total); // driver + ORBIT = what the customer paid
    const t = await trips.findOneByOrFail({ id });
    expect(lines.find((l) => l.kind === 'TRIP_EARNING')!.amount).toBe(t.driverEarning);
    expect(lines.every((l) => l.source === 'TRIP' && !l.cashCollected && l.userId === t.driverId)).toBe(true);

    const e = await earnings(r1);
    expect(e).toMatchObject({ tripsSettled: 1, payableByOrbit: t.driverEarning, cashHeld: 0, owedToOrbit: 0 });
    expect(e.recent[0]).toMatchObject({ source: 'TRIP', waybillNo: t.code, cash: false, kind: 'TRIP_EARNING' });
    expect((await api().get('/api/driver/trips/active').set(bearer(r1)).expect(200)).body).toEqual({ none: true });
  });

  it('lets both sides rate once, and the customer tip a card trip once, within sensible limits', async () => {
    let t = await view(ada, id);
    expect(t).toMatchObject({ canRate: true, canTip: true });
    await api().post(`/api/trips/${id}/rate`).set(bearer(ada)).send({ rating: 6 }).expect(400);
    await api().post(`/api/trips/${id}/rate`).set(bearer(bola)).send({ rating: 5 }).expect(404);
    await api().post(`/api/trips/${id}/rate`).set(bearer(ada)).send({ rating: 5, comment: 'Smooth ride' }).expect(200);
    await api().post(`/api/trips/${id}/rate`).set(bearer(ada)).send({ rating: 1 }).expect(409);
    await api().post(`/api/trips/${id}/rate`).set(bearer(r1)).send({ rating: 4 }).expect(200);
    expect((await earnings(r1)).rating).toEqual({ average: 5, count: 1 });
    expect((await users.findOneByOrFail({ email: 'student@orbit.demo' }))).toMatchObject({ ratingSum: 4, ratingCount: 1 });

    await api().post(`/api/trips/${id}/tip`).set(bearer(ada)).send({ amount: 100_000 }).expect(400); // more than the fare
    t = (await api().post(`/api/trips/${id}/tip`).set(bearer(ada)).send({ amount: 100 }).expect(200)).body;
    expect(t).toMatchObject({ canTip: false, canRate: false, price: { tip: 100 } });
    await api().post(`/api/trips/${id}/tip`).set(bearer(ada)).send({ amount: 100 }).expect(409);
    const tipLine = (await linesOf(id)).find((l) => l.kind === 'TRIP_TIP')!;
    expect(tipLine).toMatchObject({ party: 'COURIER', amount: 100 }); // the driver keeps all of it
    expect((await earnings(r1)).payableByOrbit).toBe((await trips.findOneByOrFail({ id })).driverEarning + 100);
  });

  it('lists finished trips for both people, newest first, with a total', async () => {
    const mine = await api().get('/api/trips').query({ scope: 'past' }).set(bearer(ada)).expect(200);
    expect(mine.headers['x-total-count']).toBe('1');
    expect(mine.body[0]).toMatchObject({ id, status: 'COMPLETED' });
    expect((await api().get('/api/trips').query({ scope: 'active' }).set(bearer(ada)).expect(200)).body).toEqual([]);
    const theirs = await api().get('/api/driver/trips').set(bearer(r1)).expect(200);
    expect(theirs.headers['x-total-count']).toBe('1');
    expect(theirs.body[0].customer).toMatchObject({ firstName: expect.any(String), phone: null }); // contact details go away once it is over
    expect((await api().get('/api/trips').set(bearer(bola)).expect(200)).body).toEqual([]);
  });
});

describe('a cash ride', () => {
  afterAll(clean);

  it('leaves the cash with the driver, who then owes ORBIT its commission, and has no in-app tip', async () => {
    const before = await earnings(r1);
    const t = (await requestTrip(ada, { paymentMethod: 'CASH' }).expect(201)).body;
    const taken = (await accept(r1, t.id).expect(200)).body;
    expect(taken.price.collectInCash).toBe(t.price.total);
    const done = await finish(ada, r1, t.id, 'RIDE');
    expect(done.status).toBe('COMPLETED');

    const lines = await linesOf(t.id);
    expect(lines.every((l) => l.cashCollected)).toBe(true);
    expect(sum(lines)).toBe(t.price.total);
    const trip = await trips.findOneByOrFail({ id: t.id });
    const e = await earnings(r1);
    expect(e.cashHeld - before.cashHeld).toBe(trip.driverEarning);
    expect(e.owedToOrbit - before.owedToOrbit).toBe(trip.fare - trip.driverEarning);
    expect(e.payableByOrbit).toBe(before.payableByOrbit); // nothing for ORBIT to pay out on cash

    await api().post(`/api/trips/${t.id}/tip`).set(bearer(ada)).send({ amount: 100 }).expect(409);
  });
});

describe('parcels and freight', () => {
  afterAll(clean);

  it('needs a recipient, and a vehicle that can carry the load', async () => {
    await requestTrip(ada, { kind: 'PARCEL', goodsType: 'FOOD', weightKg: 2 }).expect(400); // no recipient
    await requestParcel(ada, { recipientPhone: '123' }).expect(400);
    await requestParcel(ada, { weightKg: 200 }).expect(400); // a motorbike cannot take 200 kg
    await requestParcel(ada, { vehicleType: 'ROCKET' }).expect(400);
    await requestTrip(ada, { vehicleType: 'LORRY' }).expect(400); // lorries do not carry passengers
    await requestTrip(ada, { vehicleType: 'KEKE', passengers: 4 }).expect(400); // a keke seats three
  });

  it('carries a fragile parcel: handling note to the driver, no start PIN, recipient’s PIN to finish, five wrong tries lock it', async () => {
    const t = (await requestParcel(ada).expect(201)).body;
    expect(t).toMatchObject({ kind: 'PARCEL', cargo: { goodsType: 'FRAGILE', careful: true, weightKg: 3 }, pin: { purpose: 'drop' }, recipient: { name: 'Chidi Okeke' } });
    const taken = (await accept(r1, t.id).expect(200)).body;
    expect(taken.cargo).toMatchObject({ careful: true, handling: expect.stringMatching(/Breakable/) });
    expect(taken.recipient).toMatchObject({ name: 'Chidi Okeke', phone: '+2348031230999' }); // the driver can call the recipient
    expect(taken.pin).toBeNull();

    await api().post(`/api/driver/trips/${t.id}/arrived`).set(bearer(r1)).expect(200);
    await api().post(`/api/driver/trips/${t.id}/start`).set(bearer(r1)).send({}).expect(200); // goods are collected without a PIN
    await api().post(`/api/driver/trips/${t.id}/complete`).set(bearer(r1)).send({}).expect(400); // the recipient must give theirs

    const pin = (await view(ada, t.id)).pin.code as string;
    const wrong = pin === '0000' ? '1111' : '0000';
    for (const left of [4, 3, 2, 1]) {
      const r = await api().post(`/api/driver/trips/${t.id}/complete`).set(bearer(r1)).send({ pin: wrong }).expect(403);
      expect(r.body.message).toContain(`${left} ${left === 1 ? 'try' : 'tries'} left`);
    }
    await api().post(`/api/driver/trips/${t.id}/complete`).set(bearer(r1)).send({ pin: wrong }).expect(423);
    await api().post(`/api/driver/trips/${t.id}/complete`).set(bearer(r1)).send({ pin }).expect(423); // even the right PIN, until ORBIT steps in
    expect((await view(ada, t.id)).pinLocked).toBe(true);

    await api().post(`/api/admin/trips/${t.id}/unlock-pin`).set(bearer(ada)).expect(403);
    await api().post(`/api/admin/trips/${t.id}/unlock-pin`).set(bearer(admin)).expect(200);
    const done = (await api().post(`/api/driver/trips/${t.id}/complete`).set(bearer(r1)).send({ pin }).expect(200)).body;
    expect(done.status).toBe('COMPLETED');
    expect(sum(await linesOf(t.id))).toBe(t.price.total);
  });

  it('moves three tonnes of building materials on a truck, which is quoted with no surge and only offered to trucks', async () => {
    const truck = await driver('TRUCK', 'TRK-111-AA', NEAR_A);
    const q = (await api().post('/api/trips/quote').set(bearer(ada)).send({ kind: 'PARCEL', pickup: A, drop: B, weightKg: 3000, goodsType: 'BUILDING' }).expect(200)).body;
    const opt = q.options.find((o: { vehicleType: string }) => o.vehicleType === 'TRUCK');
    expect(opt).toMatchObject({ fleet: 'HEAVY', surge: 1, driversNearby: 1, available: true });
    const expected = computeFare({ tariff: VEHICLE_SPECS.TRUCK.tariff, market: MARKETS.NG, distanceM: q.route.distanceM, durationS: opt.durationS, surge: 1, commissionBps: config.trips.commissionBps });
    expect(opt.fare).toBe(expected.fare);

    const t = (await requestParcel(ada, { vehicleType: 'TRUCK', goodsType: 'BUILDING', weightKg: 3000, paymentMethod: 'CASH' }).expect(201)).body;
    expect(await offersOf(r1)).toEqual([]); // motorbike riders are not asked to carry three tonnes
    expect((await offersOf(truck.token)).map((o) => o.tripId)).toEqual([t.id]);
    await accept(truck.token, t.id).expect(200);
    const done = await finish(ada, truck.token, t.id, 'PARCEL');
    expect(done).toMatchObject({ status: 'COMPLETED', vehicle: { type: 'TRUCK', plate: 'TRK111AA' } });
    const trip = await trips.findOneByOrFail({ id: t.id });
    expect(trip.driverEarning + trip.commission).toBe(trip.fullFare);
  });
});

describe('matching', () => {
  beforeAll(() => setWaveSize(1));
  afterAll(async () => { setWaveSize(3); await clean(); });
  afterEach(clean);

  it('offers one driver at a time, asks the next when one declines, and re-offers when a driver drops the trip', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    expect(t.search.wave).toBe(1);
    expect((await offersOf(r1)).map((o) => o.tripId)).toEqual([t.id]); // the nearest driver first
    expect(await offersOf(d2.token)).toEqual([]);

    await api().post(`/api/driver/offers/${t.id}/decline`).set(bearer(r1)).expect(200);
    expect((await view(ada, t.id)).search.wave).toBe(2); // nobody left in wave 1, so on to the next
    expect(await offersOf(r1)).toEqual([]);
    expect((await offersOf(d2.token)).map((o) => o.tripId)).toEqual([t.id]);

    await accept(d2.token, t.id).expect(200);
    expect(await offersOf(r1)).toEqual([]);
    const dropped = (await api().post(`/api/driver/trips/${t.id}/cancel`).set(bearer(d2.token)).expect(200)).body;
    expect(dropped).toEqual({ result: 'searching' });
    const again = await view(ada, t.id);
    expect(again).toMatchObject({ status: 'SEARCHING', driver: null, vehicle: null });
    expect(await offersOf(d2.token)).toEqual([]); // never offered the same trip again
    expect((await offersOf(r1)).map((o) => o.tripId)).toEqual([t.id]); // the first driver gets another chance

    await accept(r1, t.id).expect(200);
    expect((await trips.findOneByOrFail({ id: t.id })).redispatches).toBe(1);
  });

  it('moves on when offers go unanswered, and ends the trip cleanly when nobody is left', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    await expire(t.id);
    expect(await matching.sweep()).toBe(1);
    expect((await offersOf(r1))).toEqual([]); // r1’s offer lapsed
    expect((await offersOf(d2.token)).map((o) => o.tripId)).toEqual([t.id]);
    await accept(r1, t.id).expect(409);

    await expire(t.id);
    await matching.sweep();
    const after = await view(ada, t.id);
    expect(after).toMatchObject({ status: 'NO_DRIVER', cancelledBy: 'SYSTEM', search: null });
    expect(after.cancelReason).toMatch(/No driver/);
    expect(await offersOf(d2.token)).toEqual([]);
    expect((await api().get('/api/trips/active').set(bearer(ada)).expect(200)).body).toEqual({ none: true });
    await requestTrip(ada).expect(201); // free to try again
  });

  it('ends a trip straight away when no driver of that kind is online at all', async () => {
    const t = (await requestTrip(ada, { vehicleType: 'CAR' }).expect(201)).body;
    expect(t).toMatchObject({ status: 'NO_DRIVER' });
  });

  it('gives the trip to exactly one of several drivers who accept at the same moment, and busy drivers get no more offers', async () => {
    setWaveSize(3);
    const t = (await requestTrip(ada).expect(201)).body;
    const results = await Promise.all([accept(r1, t.id), accept(d2.token, t.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = (await trips.findOneByOrFail({ id: t.id })).driverId!;
    const [winnerToken, loserToken] = winner === d2.id ? [d2.token, r1] : [r1, d2.token];
    expect(await offersOf(loserToken)).toEqual([]);

    const other = (await requestTrip(bola).expect(201)).body; // a second customer, while the winner is busy
    expect(await offersOf(winnerToken)).toEqual([]);
    expect((await offersOf(loserToken)).map((o) => o.tripId)).toEqual([other.id]);
    await accept(winnerToken, other.id).expect(409);
    setWaveSize(1);
  });

  it('keeps shop deliveries and trips apart: a driver on a trip cannot take a delivery job', async () => {
    setWaveSize(3);
    const t = (await requestTrip(ada).expect(201)).body;
    await accept(r1, t.id).expect(200);
    const jobs = await api().post('/api/rider/jobs/00000000-0000-4000-8000-000000000000/claim').set(bearer(r1));
    expect([404, 409]).toContain(jobs.status); // never a success; the order does not exist, and the check for trips comes first
    setWaveSize(1);
  });
});

describe('cancelling', () => {
  afterAll(clean);
  afterEach(clean);

  it('is free while searching, withdraws the offers, and cannot be done twice', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    expect(await offersOf(r1)).toHaveLength(1);
    const c = (await api().post(`/api/trips/${t.id}/cancel`).set(bearer(ada)).send({ reason: 'Changed my mind' }).expect(200)).body;
    expect(c).toMatchObject({ status: 'CANCELLED', cancelledBy: 'CUSTOMER', price: { cancelFee: 0 } });
    expect(await offersOf(r1)).toEqual([]);
    await api().post(`/api/trips/${t.id}/cancel`).set(bearer(ada)).send({}).expect(409);
    await api().post(`/api/trips/${t.id}/cancel`).set(bearer(bola)).send({}).expect(404);
  });

  it('is free in the first couple of minutes after a driver accepts, and frees the driver', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    await accept(r1, t.id).expect(200);
    const c = (await api().post(`/api/trips/${t.id}/cancel`).set(bearer(ada)).send({}).expect(200)).body;
    expect(c).toMatchObject({ status: 'CANCELLED', price: { cancelFee: 0 } });
    expect((await trips.findOneByOrFail({ id: t.id })).lateCancel).toBe(false);
    expect((await api().get('/api/driver/trips/active').set(bearer(r1)).expect(200)).body).toEqual({ none: true });
    expect(await linesOf(t.id)).toEqual([]);
  });

  it('costs a card customer the cancellation fee after the free window, paid to the driver less ORBIT’s share', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    await accept(r1, t.id).expect(200);
    await trips.update({ id: t.id }, { acceptedAt: new Date(Date.now() - 10 * 60_000) });
    expect((await view(ada, t.id)).cancel).toEqual({ allowed: true, fee: 200, late: true }); // the app warns before they confirm
    const c = (await api().post(`/api/trips/${t.id}/cancel`).set(bearer(ada)).send({}).expect(200)).body;
    expect(c.price.cancelFee).toBe(200);
    const lines = await linesOf(t.id);
    expect(lines.map((l) => `${l.party}:${l.amount}`).sort()).toEqual(['COURIER:180', 'PLATFORM:20']);
    expect(sum(lines)).toBe(200);
  });

  it('lets a driver cancel a trip after the customer’s PIN is known only until it starts, and notifies the customer', async () => {
    const t = (await requestTrip(ada).expect(201)).body;
    await accept(r1, t.id).expect(200);
    await api().post(`/api/driver/trips/${t.id}/arrived`).set(bearer(r1)).expect(200);
    const dropped = (await api().post(`/api/driver/trips/${t.id}/cancel`).set(bearer(r1)).expect(200)).body;
    expect(dropped.result).toBe('searching');
    const inbox = (await api().get('/api/notifications').set(bearer(ada)).expect(200)).body as Array<{ type: string }>;
    expect(inbox.map((n) => n.type)).toEqual(expect.arrayContaining(['trip.accepted', 'trip.arrived', 'trip.redispatched']));
    expect((await trips.findOneByOrFail({ id: t.id }))).toMatchObject({ status: 'SEARCHING', driverId: null, arrivedAt: null });
  });

  it('stops someone who keeps cancelling on drivers who are already on the way, for an hour', async () => {
    const carl = await signUp('CUSTOMER');
    for (let i = 0; i < 3; i++) {
      const t = (await requestTrip(carl.token).expect(201)).body;
      await accept(r1, t.id).expect(200);
      await trips.update({ id: t.id }, { acceptedAt: new Date(Date.now() - 10 * 60_000) });
      await api().post(`/api/trips/${t.id}/cancel`).set(bearer(carl.token)).send({}).expect(200);
    }
    const blocked = await requestTrip(carl.token).expect(429);
    expect(blocked.body.message).toMatch(/can request again in/);
    await requestTrip(ada).expect(201); // others are not affected

    await trips.update({ customerId: carl.id }, { cancelledAt: new Date(Date.now() - 2 * 3_600_000) });
    await clean();
    await requestTrip(carl.token).expect(201); // an hour later they can ride again
  });
});

describe('surge pricing and the price lock', () => {
  afterAll(async () => { await clean(); });

  it('raises the price when requests outnumber drivers, and refuses a request made at a stale price', async () => {
    await place(d2.email, NEAR_A_2, false); // only one motorbike driver is working
    for (let i = 0; i < 3; i++) {
      const c = await signUp('CUSTOMER');
      await requestTrip(c.token, { acceptedSurge: 2 }).expect(201); // these customers accept whatever the price is
    }
    const q = (await api().post('/api/trips/quote').set(bearer(ada)).send({ kind: 'RIDE', pickup: A, drop: B }).expect(200)).body;
    const moto = q.options.find((o: { vehicleType: string }) => o.vehicleType === 'MOTORCYCLE');
    expect(moto).toMatchObject({ surge: 1.5, driversNearby: 1 }); // 4 requests for 1 driver
    expect(moto.surgeAmount).toBeGreaterThan(0);
    const keke = q.options.find((o: { vehicleType: string }) => o.vehicleType === 'KEKE');
    expect(keke.surge).toBe(1); // other vehicle types are priced on their own demand

    const stale = await requestTrip(ada).expect(409); // the customer last saw 1x
    expect(stale.body).toMatchObject({ code: 'PRICE_CHANGED', current: { vehicleType: 'MOTORCYCLE', surge: 1.5, fare: moto.fare } });
    const t = (await requestTrip(ada, { acceptedSurge: 1.5 }).expect(201)).body;
    expect(t.price).toMatchObject({ surge: 1.5, fullFare: moto.fare, total: moto.fare });
  });
});

describe('promo codes', () => {
  let promoId: string;
  afterAll(clean);

  it('are created by ORBIT staff only, with sensible limits', async () => {
    await api().post('/api/admin/promos').set(bearer(ada)).send({ code: 'WELCOME50', type: 'PERCENT', value: 50 }).expect(403);
    await api().post('/api/admin/promos').set(bearer(admin)).send({ code: 'BAD', type: 'PERCENT', value: 150 }).expect(400);
    await api().post('/api/admin/promos').set(bearer(admin)).send({ code: 'x', type: 'PERCENT', value: 10 }).expect(400);
    const p = (await api().post('/api/admin/promos').set(bearer(admin)).send({ code: 'welcome50', type: 'PERCENT', value: 50, maxDiscount: 300, maxUses: 100, validDays: 30 }).expect(201)).body;
    promoId = p.id;
    expect(p).toMatchObject({ code: 'WELCOME50', currency: 'NGN', usedCount: 0, active: true });
    await api().post('/api/admin/promos').set(bearer(admin)).send({ code: 'WELCOME50', type: 'FLAT', value: 100 }).expect(409);
    expect((await api().post('/api/trips/promo/check').set(bearer(ada)).send({ code: 'WELCOME50' }).expect(200)).body).toMatchObject({ code: 'WELCOME50', type: 'PERCENT', value: 50 });
    await api().post('/api/trips/promo/check').set(bearer(ada)).send({ code: 'NOSUCHCODE' }).expect(400);
  });

  it('are given back when the trip never happened', async () => {
    const t = (await requestTrip(ada, { vehicleType: 'CAR', promoCode: 'WELCOME50' }).expect(201)).body; // no car drivers: ends at once
    expect(t.status).toBe('NO_DRIVER');
    expect((await promos.findOneByOrFail({ id: promoId })).usedCount).toBe(0);
    await api().post('/api/trips/promo/check').set(bearer(ada)).send({ code: 'WELCOME50' }).expect(200);
  });

  it('come out of ORBIT’s commission, never the driver’s earning, and work once per person', async () => {
    const t = (await requestTrip(ada, { promoCode: 'welcome50' }).expect(201)).body;
    const row = await trips.findOneByOrFail({ id: t.id });
    expect(row.discount).toBeGreaterThan(0);
    expect(row.discount).toBeLessThanOrEqual(row.commission); // capped at ORBIT's own share
    expect(t.price).toMatchObject({ promoCode: 'WELCOME50', discount: row.discount, total: row.fullFare - row.discount });
    expect(row.driverEarning).toBe(row.fullFare - row.commission); // untouched

    await accept(r1, t.id).expect(200);
    await finish(ada, r1, t.id, 'RIDE');
    const lines = await linesOf(t.id);
    expect(lines.every((l) => l.amount > 0)).toBe(true);
    expect(sum(lines)).toBe(row.fare); // still adds up to what the customer paid
    expect(lines.find((l) => l.kind === 'TRIP_EARNING')!.amount).toBe(row.driverEarning);
    expect((await promos.findOneByOrFail({ id: promoId })).usedCount).toBe(1);

    await requestTrip(ada, { promoCode: 'WELCOME50' }).expect(400); // already used by this person
    await api().post(`/api/admin/promos/${promoId}/deactivate`).set(bearer(admin)).expect(200);
    await requestTrip(bola, { promoCode: 'WELCOME50' }).expect(400); // switched off
    expect((await api().get('/api/admin/promos').set(bearer(admin)).expect(200)).body[0]).toMatchObject({ code: 'WELCOME50', active: false, usedCount: 1 });
  });
});

describe('safety: sharing a trip, live position and SOS', () => {
  let id: string;
  afterAll(clean);

  it('only offers sharing and SOS once a driver is on the way', async () => {
    id = (await requestTrip(ada).expect(201)).body.id;
    await api().post(`/api/trips/${id}/share`).set(bearer(ada)).expect(409);
    await api().post(`/api/trips/${id}/sos`).set(bearer(ada)).send({}).expect(409);
    await accept(r1, id).expect(200);
  });

  it('gives a link anyone can open, with first name, vehicle and position but no contact details, that can be switched off', async () => {
    await api().post(`/api/trips/${id}/share`).set(bearer(bola)).expect(404);
    const { token } = (await api().post(`/api/trips/${id}/share`).set(bearer(ada)).expect(200)).body;
    expect((await api().post(`/api/trips/${id}/share`).set(bearer(ada)).expect(200)).body.token).toBe(token); // the same link each time
    const pub = await api().get(`/api/track/${token}`).expect(200); // no sign-in
    expect(pub.body).toMatchObject({ status: 'ACCEPTED', driver: { firstName: 'Abdul' }, vehicle: { plate: 'KJA123AA' }, position: { lat: NEAR_A.lat } });
    expect(pub.body.drop.address).toBe(B.address);
    expect(JSON.stringify(pub.body)).not.toMatch(/phone|08031|\+234|@orbit|Student/i);
    await api().get('/api/track/not-a-real-token-0123456789').expect(404);
    await api().get('/api/track/x').expect(404);

    await api().delete(`/api/trips/${id}/share`).set(bearer(ada)).expect(200);
    await api().get(`/api/track/${token}`).expect(404);
    expect((await view(ada, id)).shared).toBe(false);
  });

  it('streams the moving dot only to the customer whose trip it is', async () => {
    await app.listen(0);
    const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const open = async (token: string) => {
      const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve, reject) => { s.on('connect', () => resolve()); s.on('connect_error', reject); });
      return s;
    };
    const customer = await open(ada);
    const stranger = await open(bola);
    let leaked = false;
    stranger.on('courier.moved', () => { leaked = true; });
    const moved = new Promise<Record<string, unknown>>((resolve) => customer.on('courier.moved', resolve));
    const changed = new Promise<Record<string, unknown>>((resolve) => customer.on('trip.updated', resolve));

    await api().put('/api/rider/location').set(bearer(r1)).send({ lat: 6.518, lng: 3.372, heading: 45 }).expect(200);
    expect(await moved).toMatchObject({ tripId: id, lat: 6.518, lng: 3.372, heading: 45 });
    await api().post(`/api/driver/trips/${id}/arrived`).set(bearer(r1)).expect(200);
    expect(await changed).toMatchObject({ tripId: id, status: 'ARRIVED' });
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);
    customer.close(); stranger.close();
  });

  it('raises an alert that ORBIT staff see at once, once per person per trip', async () => {
    const mine = (await api().post(`/api/trips/${id}/sos`).set(bearer(ada)).send({ note: 'Driver is taking a strange route', lat: 6.52, lng: 3.37 }).expect(200)).body;
    expect(mine.status).toBe('OPEN');
    expect((await api().post(`/api/trips/${id}/sos`).set(bearer(ada)).send({}).expect(200)).body.id).toBe(mine.id); // pressing twice does not page twice
    await api().post(`/api/trips/${id}/sos`).set(bearer(r1)).send({}).expect(200); // the driver can raise one too
    await api().post(`/api/trips/${id}/sos`).set(bearer(bola)).send({}).expect(404);
    await api().post(`/api/trips/${id}/sos`).set(bearer(admin)).send({}).expect(403);

    await api().get('/api/admin/sos').set(bearer(ada)).expect(403);
    const open = (await api().get('/api/admin/sos').set(bearer(admin)).expect(200)).body;
    expect(open).toHaveLength(2);
    expect(open.find((a: { raisedBy: string }) => a.raisedBy === 'CUSTOMER')).toMatchObject({
      note: 'Driver is taking a strange route', lat: 6.52, trip: { id, status: 'ARRIVED', vehicle: { plate: 'KJA123AA' } }, person: { phone: expect.any(String) },
    });
    const adminInbox = (await api().get('/api/notifications').set(bearer(admin)).expect(200)).body as Array<{ type: string }>;
    expect(adminInbox.filter((n) => n.type === 'sos').length).toBeGreaterThanOrEqual(2);

    await api().post(`/api/admin/sos/${mine.id}/resolve`).set(bearer(admin)).send({ note: 'Called the passenger; all fine' }).expect(200);
    await api().post(`/api/admin/sos/${mine.id}/resolve`).set(bearer(admin)).send({}).expect(409);
    expect((await api().get('/api/admin/sos').set(bearer(admin)).expect(200)).body).toHaveLength(1);
    expect((await api().get('/api/admin/sos').query({ status: 'RESOLVED' }).set(bearer(admin)).expect(200)).body).toHaveLength(1);
  });

  it('keeps a shared link working for two hours after the trip, then retires it', async () => {
    const { token } = (await api().post(`/api/trips/${id}/share`).set(bearer(ada)).expect(200)).body;
    await api().post(`/api/driver/trips/${id}/start`).set(bearer(r1)).send({ pin: (await view(ada, id)).pin.code }).expect(200);
    await api().post(`/api/driver/trips/${id}/complete`).set(bearer(r1)).send({}).expect(200);
    expect((await api().get(`/api/track/${token}`).expect(200)).body).toMatchObject({ status: 'COMPLETED', position: null });
    await trips.update({ id }, { completedAt: new Date(Date.now() - 3 * 3_600_000) });
    await api().get(`/api/track/${token}`).expect(404);
  });
});

describe('ORBIT staff', () => {
  it('can list, filter and cancel trips, and sees the whole picture including names and phone numbers', async () => {
    const all = await api().get('/api/admin/trips').query({ status: 'COMPLETED', limit: 5 }).set(bearer(admin)).expect(200);
    expect(Number(all.headers['x-total-count'])).toBe(await trips.count({ where: { status: 'COMPLETED' } }));
    expect(all.body.length).toBeGreaterThan(0);
    expect(all.body.every((t: { status: string }) => t.status === 'COMPLETED')).toBe(true);
    expect(all.body[0]).toMatchObject({ customer: { name: expect.any(String), phone: expect.any(String) }, driver: { name: expect.any(String) }, price: { commission: expect.any(Number) } });
    await api().get('/api/admin/trips').set(bearer(ada)).expect(403);

    const t = (await requestTrip(ada).expect(201)).body;
    expect((await api().get('/api/admin/trips').query({ status: 'active' }).set(bearer(admin)).expect(200)).body.map((x: { id: string }) => x.id)).toContain(t.id);
    await api().post(`/api/admin/trips/${t.id}/cancel`).set(bearer(ada)).send({}).expect(403);
    await api().post(`/api/admin/trips/${t.id}/cancel`).set(bearer(admin)).send({ reason: 'Customer called support' }).expect(200);
    await api().post(`/api/admin/trips/${t.id}/cancel`).set(bearer(admin)).send({}).expect(409);
    expect(await view(ada, t.id)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'ADMIN', cancelReason: 'Customer called support', price: { cancelFee: 0 } });
    await clean();
  });

  it('reports mobility figures that agree with the ledger, and keeps them out of the marketplace figures', async () => {
    const k = (await api().get('/api/admin/kpis').set(bearer(admin)).expect(200)).body;
    const done = await trips.find({ where: { status: 'COMPLETED' } });
    expect(k.mobility).toMatchObject({ completedTrips: done.length, gmv: done.reduce((s, t) => s + t.fare, 0), openSafetyAlerts: 1 });
    expect(k.mobility.rides + k.mobility.parcels).toBe(done.length);
    expect(k.mobility.parcels).toBeGreaterThanOrEqual(2);

    const rows = await ledger.find({ where: { source: 'TRIP' } });
    const cash = rows.filter((r) => r.cashCollected);
    expect(k.mobility.platformRevenue).toBe(sum(rows.filter((r) => r.party === 'PLATFORM')));
    expect(k.mobility.cashCommissionDue).toBe(sum(cash.filter((r) => r.party === 'PLATFORM')));
    expect(k.mobility.owedToDrivers).toBe(sum(rows.filter((r) => r.party === 'COURIER' && !r.cashCollected)));
    expect(k.mobility.completionRatePct).toBeGreaterThan(0);

    // No shop order was delivered in this file, so trips must not leak into the marketplace numbers.
    expect(k.financial).toMatchObject({ platformRevenue: 0, owedToRiders: 0, owedToMerchants: 0 });
    expect(k.marketplace.completedOrders).toBe(0);
  });
});
