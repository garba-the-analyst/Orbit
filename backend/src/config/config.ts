/**
 * Central, typed application configuration.
 *
 * Values come from environment variables (optionally loaded from a local `.env` file).
 * Every setting has a development default so `npm run start:dev` works with zero setup,
 * but production refuses to boot with weak or missing secrets.
 */
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { DEFAULT_MARKET, MARKETS } from '../common/markets';

// Node 22 can load a .env file natively; no dotenv dependency needed.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/** Reads an integer environment variable, falling back to a default when unset or invalid. */
function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer (got "${raw}")`);
  }
  return n;
}

/** Reads a secret. In production it is mandatory and must be at least 32 characters. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number (got "${raw}")`);
  return n;
}

function secret(name: string, isProduction: boolean): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`${name} must be set to a random string of at least 32 characters in production`);
  }
  // Development/test: a stable per-process random secret (tokens reset on restart, which is fine).
  return value && value.length > 0 ? value : randomBytes(32).toString('hex');
}

const enabledMarkets = (process.env.ENABLED_MARKETS ?? DEFAULT_MARKET)
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);
for (const code of enabledMarkets) {
  if (!MARKETS[code]) throw new Error(`ENABLED_MARKETS lists "${code}", which is not a known market (${Object.keys(MARKETS).join(', ')}).`);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const paymentProvider = (process.env.PAYMENT_PROVIDER ?? 'mock') as 'mock';

if (isProduction && paymentProvider === 'mock' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
  throw new Error(
    'PAYMENT_PROVIDER=mock is not allowed in production (set ALLOW_MOCK_PAYMENTS=true only for a supervised demo).',
  );
}

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: int('PORT', 4000),

  db: {
    type: (process.env.DB_TYPE ?? 'sqlite') as 'sqlite' | 'postgres',
    path: process.env.DB_PATH ?? './data/orbit.sqlite',
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: secret('JWT_SECRET', isProduction),
    expiresIn: process.env.JWT_TTL ?? '12h',
  },
  /** Used to derive delivery PINs deterministically from order ids (see common/pin.util.ts). */
  pinSecret: secret('PIN_SECRET', isProduction),
  /** Shared secret used to verify payment-gateway webhook signatures. */
  webhookSecret: secret('WEBHOOK_SECRET', isProduction),

  /** Business rules taken from the ORBIT proposal (sections 6 and 11). All money is whole naira. */
  business: {
    /** Marketplace commission in basis points: 800 = 8.00%. */
    commissionBps: int('COMMISSION_BPS', 800),
    /** Delivery fee charged to the customer when an ORBIT courier delivers. */
    orbitDeliveryFee: int('ORBIT_DELIVERY_FEE', 700),
    /** Share of that fee paid to the rider. ORBIT keeps the difference (NGN 300 by default). */
    courierPayout: int('COURIER_PAYOUT', 400),
    pendingPaymentTtlMin: int('PENDING_PAYMENT_TTL_MIN', 15),
    maxLinesPerOrder: 30,
    maxQtyPerLine: 20,
  },

  paymentProvider,

  /** The countries this deployment serves. Nigeria by default; see common/markets.ts to add more. */
  markets: { enabled: enabledMarkets },

  /**
   * The superadmin is created from these settings at startup, never from source code. The password is only used
   * when the account does not exist yet; changing it later is done from inside the app.
   */
  superAdmin: {
    email: (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase(),
    password: process.env.SUPERADMIN_PASSWORD ?? '',
    name: process.env.SUPERADMIN_NAME ?? 'Super Admin',
  },
  /** How many other admins the superadmin may create. */
  maxAdmins: int('MAX_ADMINS', 6),

  uploads: {
    dir: process.env.UPLOAD_DIR ?? './data/uploads',
    maxBytes: int('UPLOAD_MAX_BYTES', 6 * 1024 * 1024),
    /** If set (for example https://api.example.com), image URLs are absolute; otherwise they are relative. */
    publicBase: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
    /** Where private documents (ID, licences, vehicle papers) live when STORAGE_DRIVER=local. Never served publicly. */
    privateDir: process.env.UPLOAD_PRIVATE_DIR ?? './data/private',
    maxDocBytes: int('UPLOAD_MAX_DOC_BYTES', 5 * 1024 * 1024),
  },

  /**
   * Where files are kept. "local" writes to disk (fine for one server with a persistent disk). "s3" uses any
   * S3-compatible bucket (Cloudflare R2, Amazon S3, Supabase Storage, MinIO) and is what a hosted deployment needs,
   * because most hosts wipe the local disk on every deploy. Two buckets keep private documents out of public reach:
   * the public one serves pictures, the private one is only ever read by the API.
   */
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'auto',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBucket: process.env.S3_PUBLIC_BUCKET ?? '',
      privateBucket: process.env.S3_PRIVATE_BUCKET ?? '',
      /** The public URL of the public bucket, for example https://pub-xxxx.r2.dev or a custom domain. */
      publicBase: (process.env.S3_PUBLIC_BASE ?? '').replace(/\/$/, ''),
    },
  },

  /** Open-source maps: OpenStreetMap tiles, OSRM routing, Nominatim place search. All replaceable by URL. */
  geo: {
    provider: (process.env.GEO_PROVIDER ?? 'osm') as 'osm' | 'offline',
    osrmUrl: (process.env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/$/, ''),
    nominatimUrl: (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
    tileUrl: process.env.TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    /** The public OSM services require an identifying User-Agent. Set GEO_CONTACT to your email or website. */
    userAgent: `ORBIT/2.0 (${process.env.GEO_CONTACT ?? 'set GEO_CONTACT'})`,
    /** Optional override of where the map opens when the person's location is unknown. Otherwise the first market's centre. */
    center: process.env.MAP_CENTER_LAT && process.env.MAP_CENTER_LNG ? { lat: num('MAP_CENTER_LAT', 0), lng: num('MAP_CENTER_LNG', 0) } : null,
    countryCodes: (process.env.GEO_COUNTRY_CODES ?? enabledMarkets.join(',')).toLowerCase(),
    timeoutMs: int('GEO_TIMEOUT_MS', 4000),
  },

  trips: {
    commissionBps: int('TRIP_COMMISSION_BPS', 1000),
    offerTtlSec: int('OFFER_TTL_SEC', 20),
    waveSize: int('OFFER_WAVE_SIZE', 3),
    maxWaves: int('OFFER_MAX_WAVES', 3),
    /** Cancelling after a driver has been on the way for longer than this costs the cancellation fee. */
    freeCancelSec: int('FREE_CANCEL_SEC', 120),
    cancelFee: int('CANCEL_FEE', 200),
    /** A driver whose last location is older than this is treated as offline for matching. */
    staleLocationSec: int('STALE_LOCATION_SEC', 90),
    maxSurge: num('MAX_SURGE', 2),
    /** How often the matching sweeper looks for expired offers, in ms. 0 turns it off (tests drive it by hand). */
    sweepMs: int('TRIP_SWEEP_MS', 3000),
    /** Wrong start/drop PINs allowed before a trip locks. */
    maxPinAttempts: int('TRIP_PIN_ATTEMPTS', 5),
    /** Pickup radius within which a driver may mark "arrived", in metres. */
    arriveRadiusM: int('ARRIVE_RADIUS_M', 500),
  },

  /** Email for password resets. With no SMTP_URL, mail is only logged (development). */
  mail: {
    url: process.env.SMTP_URL ?? '',
    from: process.env.MAIL_FROM ?? 'ORBIT <no-reply@orbit.local>',
    /** Where reset links point: the address of the web app (for example https://orbit-app.netlify.app). */
    appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  },

  /** People must accept the terms and privacy notice to sign up. On by default in production. */
  consent: { required: (process.env.REQUIRE_CONSENT ?? (isProduction ? 'true' : 'false')) === 'true' },

  /** Requests per minute per client. Auth routes are stricter to slow password guessing. */
  rateLimit: {
    global: process.env.NODE_ENV === 'test' ? 100_000 : int('RATE_LIMIT', 240),
    auth: process.env.NODE_ENV === 'test' ? 100_000 : int('AUTH_RATE_LIMIT', 10),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Demo data is never loaded in production, regardless of the flag. */
  seedOnBoot: !isProduction && (process.env.SEED_ON_BOOT ?? 'true') !== 'false',
};

if (isProduction) {
  if (config.db.type !== 'postgres' && process.env.ALLOW_SQLITE_PROD !== 'true') {
    throw new Error('Production needs PostgreSQL: set DB_TYPE=postgres and DATABASE_URL. (SQLite is for development.)');
  }
  if (config.db.type === 'postgres' && !config.db.url) throw new Error('DATABASE_URL is required when DB_TYPE=postgres.');
  if (config.corsOrigins.length === 0) {
    throw new Error('Set CORS_ORIGINS to the address(es) of your web app, comma separated (for example https://orbit-app.netlify.app,capacitor://localhost,http://localhost).');
  }
}

if (config.business.courierPayout > config.business.orbitDeliveryFee) {
  throw new Error('COURIER_PAYOUT cannot exceed ORBIT_DELIVERY_FEE (ORBIT would lose money on every delivery).');
}

export type AppConfig = typeof config;
