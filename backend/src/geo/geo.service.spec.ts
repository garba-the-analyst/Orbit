import { GeoService, stepText } from './geo.service';

const lagos = { lat: 6.5244, lng: 3.3792 };
const ikeja = { lat: 6.6018, lng: 3.3515 };

const osrmBody = {
  code: 'Ok',
  routes: [{
    distance: 12_000, duration: 900,
    geometry: { coordinates: [[3.3792, 6.5244], [3.37, 6.55], [3.3515, 6.6018]] },
    legs: [{ steps: [
      { distance: 500, name: 'Broad Street', maneuver: { type: 'depart', location: [3.3792, 6.5244] } },
      { distance: 11_500, name: 'Allen Avenue', maneuver: { type: 'turn', modifier: 'left', location: [3.37, 6.55] } },
      { distance: 0, name: '', maneuver: { type: 'arrive', location: [3.3515, 6.6018] } },
    ] }],
  }],
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function service(fetchImpl: jest.Mock) {
  return new GeoService({ online: true, fetch: fetchImpl as unknown as typeof fetch, searchSpacingMs: 0 });
}

describe('GeoService', () => {
  it('parses an OSRM route into a drawable path and readable steps', async () => {
    const f = jest.fn().mockResolvedValue(ok(osrmBody));
    const r = await service(f).route(lagos, ikeja, 'MOTORCYCLE' as never);
    expect(r.source).toBe('osrm');
    expect(r.geometry[0]).toEqual([6.5244, 3.3792]); // [lat, lng], not OSRM's [lng, lat]
    expect(r.steps.map((s) => s.instruction)).toEqual(['Head out on Broad Street', 'Turn left onto Allen Avenue', 'You have arrived']);
    expect(f.mock.calls[0][0]).toContain('/route/v1/driving/3.3792,6.5244;3.3515,6.6018');
    expect(f.mock.calls[0][1].headers['User-Agent']).toMatch(/^ORBIT/); // public OSM servers require an identifying agent
  });

  it('takes a slow vehicle’s own speed into account, never faster than the road allows', async () => {
    const f = jest.fn().mockResolvedValue(ok(osrmBody));
    const bike = await service(f).route(lagos, ikeja, 'BICYCLE' as never); // 12 km at 14 km/h is about 51 minutes
    expect(bike.durationS).toBeGreaterThan(900);
    expect(bike.durationS).toBeCloseTo(12_000 / (14 / 3.6), -2);
  });

  it('caches repeated routes, so the map server is asked once', async () => {
    const f = jest.fn().mockResolvedValue(ok(osrmBody));
    const s = service(f);
    await s.route(lagos, ikeja, 'CAR' as never);
    await s.route({ lat: lagos.lat + 0.00001, lng: lagos.lng }, ikeja, 'CAR' as never); // about a metre away: same cache entry
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('falls back to an estimate when routing fails, and stops asking after repeated failures', async () => {
    const f = jest.fn().mockRejectedValue(new Error('network down'));
    const s = service(f);
    for (let i = 0; i < 3; i++) {
      const r = await s.route({ lat: lagos.lat + i * 0.01, lng: lagos.lng }, ikeja, 'CAR' as never);
      expect(r.source).toBe('estimate');
      expect(r.distanceM).toBeGreaterThan(0);
    }
    expect(f).toHaveBeenCalledTimes(3);
    await s.route({ lat: 6.4, lng: 3.3 }, ikeja, 'CAR' as never);
    expect(f).toHaveBeenCalledTimes(3); // the breaker is open: no further calls for a minute
  });

  it('treats an error response or a "NoRoute" answer as a failure, not as a route', async () => {
    const f = jest.fn().mockResolvedValueOnce({ ok: false, status: 500 } as Response).mockResolvedValueOnce(ok({ code: 'NoRoute' }));
    const s = service(f);
    expect((await s.route(lagos, ikeja, 'CAR' as never)).source).toBe('estimate');
    expect((await s.route({ lat: 6.3, lng: 3.2 }, ikeja, 'CAR' as never)).source).toBe('estimate');
  });

  it('estimates sensibly offline: road detour allowance and the vehicle’s own speed', () => {
    const s = new GeoService({ online: false });
    const r = s.estimate(lagos, ikeja, 'MOTORCYCLE' as never);
    expect(r.source).toBe('estimate');
    expect(r.distanceM).toBeGreaterThan(10_000);
    expect(r.distanceM).toBeLessThan(16_000);
    expect(r.durationS).toBeCloseTo(r.distanceM / (30 / 3.6), -1);
  });

  it('searches places, caches them, and shortens nothing the person typed beyond sensible limits', async () => {
    const f = jest.fn().mockResolvedValue(ok([{ display_name: 'Ikeja City Mall, Alausa, Lagos, Nigeria', lat: '6.6141', lon: '3.3578', type: 'mall', address: { city: 'Ikeja', state: 'Lagos', country_code: 'ng' } }]));
    const s = service(f);
    const a = await s.search('ikeja city mall');
    expect(a[0]).toMatchObject({ lat: 6.6141, lng: 3.3578, city: 'Ikeja', state: 'Lagos', country: 'NG' });
    await s.search('  Ikeja   City Mall ');
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain('countrycodes=ng');
    expect(await s.search('ab')).toEqual([]); // too short to be worth a request
  });

  it('serialises place searches so Nominatim’s one-per-second rule is respected', async () => {
    let running = 0;
    let overlap = false;
    const f = jest.fn(async () => { running++; if (running > 1) overlap = true; await new Promise((r) => setTimeout(r, 5)); running--; return ok([]); });
    const s = service(f as unknown as jest.Mock);
    await Promise.all(['alpha place', 'beta place', 'gamma place'].map((q) => s.search(q)));
    expect(f).toHaveBeenCalledTimes(3);
    expect(overlap).toBe(false);
  });

  it('returns nothing, rather than failing, when the search service is down or offline', async () => {
    expect(await service(jest.fn().mockRejectedValue(new Error('x'))).search('some place')).toEqual([]);
    expect(await new GeoService({ online: false }).search('some place')).toEqual([]);
    expect(await new GeoService({ online: false }).reverse(lagos)).toBeNull();
  });
});

describe('stepText', () => {
  it.each([
    ['turn', 'sharp right', 'Mile 2 Road', 'Turn sharp right onto Mile 2 Road'],
    ['roundabout', undefined, 'Ring Road', 'Enter the roundabout onto Ring Road'],
    ['arrive', undefined, '', 'You have arrived'],
    ['merge', 'slight left', 'Third Mainland Bridge', 'Merge onto Third Mainland Bridge'],
  ])('%s -> %s', (type, modifier, name, expected) => {
    expect(stepText(type, modifier, name)).toBe(expected);
  });
});
