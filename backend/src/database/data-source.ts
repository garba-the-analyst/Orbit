/**
 * Used by the TypeORM command line to create and run migrations (see the migration:* scripts in package.json):
 *   DATABASE_URL=postgres://... npm run migration:generate -- src/database/migrations/Name
 *   DATABASE_URL=postgres://... npm run migration:run
 */
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { entities } from './entities';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
});
