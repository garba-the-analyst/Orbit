/**
 * Central, typed application configuration.
 *
 * Values come from environment variables (optionally loaded from a local `.env` file).
 * Every setting has a development default so `npm run start:dev` works with zero setup,
 * but production refuses to boot with weak or missing secrets.
 */
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

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
function secret(name: string, isProduction: boolean): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`${name} must be set to a random string of at least 32 characters in production`);
  }
  // Development/test: a stable per-process random secret (tokens reset on restart, which is fine).
  return value && value.length > 0 ? value : randomBytes(32).toString('hex');
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
    pilotZone: process.env.PILOT_ZONE ?? 'Campus pilot zone',
  },

  paymentProvider,

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

if (config.business.courierPayout > config.business.orbitDeliveryFee) {
  throw new Error('COURIER_PAYOUT cannot exceed ORBIT_DELIVERY_FEE (ORBIT would lose money on every delivery).');
}

export type AppConfig = typeof config;
