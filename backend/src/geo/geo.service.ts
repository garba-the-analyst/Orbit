import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { VEHICLE_SPECS } from '../common/catalog';
import type { VehicleType } from '../common/enums';
import { haversineM } from '../common/markets';
import { config } from '../config/config';

export type LatLng = { lat: number; lng: number };

export interface NavStep {
  /** Plain-language instruction, e.g. "Turn left onto Allen Avenue". */
  instruction: string;
  distanceM: number;
  /** Where the manoeuvre happens. */
  at: [number, number];
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  /** The path to draw, as [lat, lng] pairs. */
  geometry: Array<[number, number]>;
  steps: NavStep[];
  /** "osrm" is a real road route. "estimate" is a straight-line guess used when routing is unavailable. */
  source: 'osrm' | 'estimate';
}

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  type: string;
  city: string;
  state: string;
  country: string;
}

/** Test hooks: the real service reads config; tests inject a fake network. */
export interface GeoOptions {
  online: boolean;
  fetch: typeof fetch;
  searchSpacingMs: number;
}
export const GEO_OPTIONS = Symbol('GEO_OPTIONS');

/** A small time-limited cache that cannot grow without bound. */
class TtlCache<T> {
  private readonly map = new Map<string, { value: T; until: number }>();
  constructor(private readonly ttlMs: number, private readonly max: number) {}
  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.until < Date.now()) { this.map.delete(key); return undefined; }
    return hit.value;
  }
  set(key: string, value: T) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string); // drop the oldest
    this.map.set(key, { value, until: Date.now() + this.ttlMs });
  }
}

const r4 = (n: number) => n.toFixed(4); // about 11 metres: close points share a cache entry
const MAX_POINTS = 300;

/** Keeps the route line light: at most MAX_POINTS points, always including both ends. */
function thin(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= MAX_POINTS) return points;
  const stride = Math.ceil(points.length / MAX_POINTS);
  const out = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const MODIFIERS: Record<string, string> = {
  left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right',
  'sharp left': 'sharp left', 'sharp right': 'sharp right', uturn: 'around (U-turn)', straight: 'straight on',
};

/** Turns an OSRM manoeuvre into a sentence a driver can follow. */
export function stepText(type: string, modifier: string | undefined, name: string, exit?: number): string {
  const road = name ? ` onto ${name}` : '';
  const way = modifier ? (MODIFIERS[modifier] ?? modifier) : '';
  switch (type) {
    case 'depart': return name ? `Head out on ${name}` : 'Start driving';
    case 'arrive': return 'You have arrived';
    case 'turn': case 'end of road': return way ? `Turn ${way}${road}` : `Continue${road}`;
    case 'new name': case 'continue': return name ? `Continue on ${name}` : 'Continue straight';
    case 'merge': return `Merge${road}`;
    case 'on ramp': case 'off ramp': case 'fork': return way ? `Keep ${way}${road}` : `Take the ramp${road}`;
    case 'roundabout': case 'rotary': return exit ? `At the roundabout take exit ${exit}${road}` : `Enter the roundabout${road}`;
    default: return way ? `Go ${way}${road}` : `Continue${road}`;
  }
}

/**
 * Maps, directions and place search from open data: OSRM for routes, Nominatim for addresses, OpenStreetMap tiles
 * on the client. Everything is cached, rate-limited and has a graceful fallback, because a public map service can
 * be slow or down and a ride request must never fail for that reason.
 *
 * Scale note: the public OSRM and Nominatim servers are for light use only. For real traffic, run your own
 * (OSRM with the Nigeria extract from Geofabrik is a few GB) and set OSRM_URL / NOMINATIM_URL. No code changes.
 */
@Injectable()
export class GeoService {
  private readonly log = new Logger('Geo');
  private readonly opts: GeoOptions;
  private readonly routes = new TtlCache<RouteResult>(10 * 60_000, 2000);
  private readonly searches = new TtlCache<PlaceResult[]>(24 * 3_600_000, 2000);
  private readonly reverses = new TtlCache<string>(24 * 3_600_000, 2000);

  /** Routing is skipped for a minute after repeated failures, so a dead server costs nothing per request. */
  private failures = 0;
  private breakerUntil = 0;
  /** Nominatim allows one request per second. All searches share this single lane. */
  private lane: Promise<unknown> = Promise.resolve();

  constructor(@Optional() @Inject(GEO_OPTIONS) opts?: Partial<GeoOptions>) {
    this.opts = {
      online: config.geo.provider === 'osm' && !config.isTest,
      fetch: (...a) => fetch(...a),
      searchSpacingMs: 1100,
      ...opts,
    };
  }

  get online(): boolean {
    return this.opts.online;
  }

  // ---- Routes ------------------------------------------------------------------------------------

  async route(from: LatLng, to: LatLng, vehicle: VehicleType = 'CAR' as VehicleType): Promise<RouteResult> {
    const key = `${vehicle}|${r4(from.lat)},${r4(from.lng)}|${r4(to.lat)},${r4(to.lng)}`;
    const cached = this.routes.get(key);
    if (cached) return cached;
    const result = (await this.osrm(from, to, vehicle)) ?? this.estimate(from, to, vehicle);
    this.routes.set(key, result);
    return result;
  }

  /** A straight-line guess with a road-detour allowance. Used when routing is offline. */
  estimate(from: LatLng, to: LatLng, vehicle: VehicleType): RouteResult {
    const distanceM = Math.round(haversineM(from, to) * 1.3);
    const speedMps = (VEHICLE_SPECS[vehicle]?.avgKmh ?? 30) / 3.6;
    return {
      distanceM,
      durationS: Math.round(distanceM / speedMps),
      geometry: [[from.lat, from.lng], [to.lat, to.lng]],
      steps: [{ instruction: 'Head towards the destination', distanceM, at: [from.lat, from.lng] }, { instruction: 'You have arrived', distanceM: 0, at: [to.lat, to.lng] }],
      source: 'estimate',
    };
  }

  private async osrm(from: LatLng, to: LatLng, vehicle: VehicleType): Promise<RouteResult | null> {
    if (!this.opts.online || Date.now() < this.breakerUntil) return null;
    const url = `${config.geo.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    try {
      const res = await this.timed(url);
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const body = (await res.json()) as {
        code: string;
        routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> }; legs: Array<{ steps: Array<{ distance: number; name: string; maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] } }> }> }>;
      };
      const r = body.routes?.[0];
      if (body.code !== 'Ok' || !r) throw new Error(`OSRM code ${body.code}`);
      this.failures = 0;
      // OSRM times assume a car. A slower vehicle takes at least as long as its own average speed implies.
      const slowest = r.distance / ((VEHICLE_SPECS[vehicle]?.avgKmh ?? 30) / 3.6);
      return {
        distanceM: Math.round(r.distance),
        durationS: Math.round(Math.max(r.duration, slowest)),
        geometry: thin(r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])),
        steps: r.legs.flatMap((l) => l.steps).map((s) => ({
          instruction: stepText(s.maneuver.type, s.maneuver.modifier, s.name, s.maneuver.exit),
          distanceM: Math.round(s.distance),
          at: [s.maneuver.location[1], s.maneuver.location[0]] as [number, number],
        })),
        source: 'osrm',
      };
    } catch (e) {
      if (++this.failures >= 3) {
        this.breakerUntil = Date.now() + 60_000;
        this.failures = 0;
        this.log.warn(`Routing server failing (${(e as Error).message}); using estimates for 60 seconds.`);
      }
      return null;
    }
  }

  // ---- Place search ------------------------------------------------------------------------------

  async search(q: string, near?: LatLng): Promise<PlaceResult[]> {
    const text = q.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (text.length < 3 || !this.opts.online) return [];
    const key = `${text.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
    const cached = this.searches.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({ q: text, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: config.geo.countryCodes });
    if (near) params.set('viewbox', `${near.lng - 0.6},${near.lat + 0.6},${near.lng + 0.6},${near.lat - 0.6}`); // a bias, not a limit
    const rows = await this.queued(async () => {
      const res = await this.timed(`${config.geo.nominatimUrl}/search?${params}`);
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return (await res.json()) as Array<{ display_name: string; lat: string; lon: string; type: string; address?: Record<string, string> }>;
    }).catch((e: Error) => { this.log.warn(`Search failed: ${e.message}`); return null; });
    if (!rows) return [];
    const out = rows.map((r) => ({
      label: r.display_name, lat: Number(r.lat), lng: Number(r.lon), type: r.type,
      city: r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.county ?? '',
      state: r.address?.state ?? '', country: (r.address?.country_code ?? '').toUpperCase(),
    }));
    this.searches.set(key, out);
    return out;
  }

  /** The address at a point, or null when it cannot be found. */
  async reverse(p: LatLng): Promise<string | null> {
    if (!this.opts.online) return null;
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const cached = this.reverses.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({ format: 'jsonv2', lat: String(p.lat), lon: String(p.lng), zoom: '18' });
    const label = await this.queued(async () => {
      const res = await this.timed(`${config.geo.nominatimUrl}/reverse?${params}`);
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return ((await res.json()) as { display_name?: string }).display_name ?? null;
    }).catch((e: Error) => { this.log.warn(`Reverse failed: ${e.message}`); return null; });
    if (label) this.reverses.set(key, label);
    return label;
  }

  // ---- plumbing ----------------------------------------------------------------------------------

  private async timed(url: string): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), config.geo.timeoutMs);
    try {
      return await this.opts.fetch(url, { signal: ctl.signal, headers: { 'User-Agent': config.geo.userAgent, Accept: 'application/json' } });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Runs one task at a time with a pause after each, to respect Nominatim's one-request-per-second rule. */
  private queued<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lane.then(task, task);
    this.lane = run.then(() => new Promise((r) => setTimeout(r, this.opts.searchSpacingMs)), () => new Promise((r) => setTimeout(r, this.opts.searchSpacingMs)));
    return run;
  }
}
