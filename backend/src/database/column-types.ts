import type { ColumnType } from 'typeorm';

/**
 * Portable timestamp column type.
 *
 * SQLite has no `timestamp` type and PostgreSQL has no `datetime`, so we pick per driver.
 * It is evaluated at import time from DB_TYPE, which is set before the app boots.
 */
export const DATETIME: ColumnType = process.env.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';

/**
 * Portable column type for ids and foreign keys.
 *
 * Primary keys are generated UUIDs, which PostgreSQL stores in its native `uuid` type. Foreign-key columns
 * must use the same type there, or PostgreSQL cannot compare them. SQLite has no uuid type, so it stores
 * them as text.
 */
export const UUID_TYPE: ColumnType = process.env.DB_TYPE === 'postgres' ? 'uuid' : 'varchar';
