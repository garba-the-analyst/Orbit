/**
 * ORBIT API entry point.
 *   npm run start:dev   -> watch mode
 *   npm run start:prod  -> compiled build (npm run build first)
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './config/config';

async function main() {
  // rawBody is kept so payment webhooks can be verified against their exact signed bytes.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app, { docs: true });
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  const log = new Logger('ORBIT');
  log.log(`API ready on http://localhost:${config.port}/api  (docs: /docs, health: /api/health)`);
  if (config.paymentProvider === 'mock') log.warn('Payments are in TEST MODE: no real money moves.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
