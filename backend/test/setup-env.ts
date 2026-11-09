/**
 * Test environment: isolated database, fixed secrets, no demo seeding on boot (tests seed explicitly),
 * and relaxed rate limits.
 *
 * Database: an in-memory SQLite database by default. To run the same suite against a real PostgreSQL
 * server, set TEST_DB=postgres and point TEST_DATABASE_URL at an EMPTY database (the tests create the
 * tables and seed demo data, so reuse needs a fresh database). See `npm run test:pg`.
 */
process.env.NODE_ENV = 'test';
if (process.env.TEST_DB === 'postgres') {
  process.env.DB_TYPE = 'postgres';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://orbit:orbit@localhost:5432/orbit_test';
  process.env.DB_DROP_SCHEMA = 'true';
} else {
  process.env.DB_TYPE = 'sqlite';
  process.env.DB_PATH = ':memory:';
}
process.env.SEED_ON_BOOT = 'false';
process.env.UPLOAD_DIR = require('node:path').join(require('node:os').tmpdir(), 'orbit-test-uploads');
process.env.SUPERADMIN_EMAIL = 'root@orbit.test';
process.env.SUPERADMIN_PASSWORD = 'Root@2026test';
process.env.SUPERADMIN_NAME = 'Test Superadmin';
process.env.JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';
process.env.PIN_SECRET = 'test-pin-secret-test-pin-secret-1234';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-test-webhook-1234';
process.env.PAYMENT_PROVIDER = 'mock';
