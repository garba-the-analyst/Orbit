/**
 * Manual seeding: `npm run seed`. Loads demo data into an empty database and exits.
 * (The API also seeds automatically on first boot in development; see SEED_ON_BOOT.)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

async function run() {
  process.env.SEED_ON_BOOT = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const seeded = await app.get(SeedService).run();
  console.log(seeded ? 'Demo data loaded.' : 'Database already has data; nothing changed.');
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
