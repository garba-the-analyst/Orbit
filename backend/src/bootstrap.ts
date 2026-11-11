/**
 * Shared application setup, used by both the real server (main.ts) and the end-to-end tests, so the
 * tests exercise exactly the same security headers, validation and CORS rules as production.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { config } from './config/config';

export function configureApp(app: INestApplication, opts: { docs?: boolean } = {}) {
  app.setGlobalPrefix('api');

  // Uploaded pictures. Names are random and never change, so browsers may cache them for a long time.
  (app as NestExpressApplication).useStaticAssets(resolve(config.uploads.dir), {
    prefix: '/uploads/',
    maxAge: '365d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
    setHeaders: (res: { setHeader: (k: string, v: string) => void }) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // the app is served from another origin
    },
  });

  // Secure HTTP headers (no sniffing, frame denial, HSTS over HTTPS, etc.).
  app.use(helmet({ contentSecurityPolicy: false /* API only; Swagger UI needs inline scripts */ }));

  // Development reflects any origin so the app works from a laptop, phone or emulator.
  // Production allows only the origins listed in CORS_ORIGINS.
  app.enableCors({
    origin: config.isProduction ? config.corsOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // Strict input validation: unknown fields are rejected, types are coerced only where declared.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      exceptionFactory: undefined,
    }),
  );

  if (opts.docs) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ORBIT API')
        .setDescription(
          'Marketplace, delivery and ride-hailing across Nigeria and Africa. ' +
            'Sign in with POST /api/auth/login, then press Authorize and paste the token.',
        )
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }
}
