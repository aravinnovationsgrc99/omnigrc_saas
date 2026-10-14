import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const logger = new Logger('ControlPlaneBootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Control Plane CORS Configuration:
  // Allows Control Panel Web (control.omnigrc.co / localhost:3002) to communicate securely.
  const corsOrigins = process.env.CONTROL_PLANE_CORS_ORIGINS;
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  const defaultOrigins = isProduction
    ? ['https://control.omnigrc.co']
    : [
        'http://localhost:3002',
        'http://127.0.0.1:3002',
        'https://control.omnigrc.co',
      ];
  const allowedOrigins = corsOrigins
    ? corsOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : defaultOrigins;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
      'x-operator-access-token',
      'x-control-plane-admin-key',
    ],
  });
  logger.log(
    `Control Plane CORS enabled for origins: ${allowedOrigins.join(', ')}`,
  );

  // Phase 10 Security: Warn at startup if admin key is not explicitly configured.
  if (!process.env.CONTROL_PLANE_ADMIN_KEY) {
    if (isProduction) {
      logger.error(
        'SECURITY CRITICAL: CONTROL_PLANE_ADMIN_KEY is not set. ' +
          'All admin requests will be rejected in production/staging environments.',
      );
    } else {
      logger.warn(
        'SECURITY WARNING: CONTROL_PLANE_ADMIN_KEY is not set. ' +
          'Using dev fallback key. DO NOT deploy to production without setting this variable.',
      );
    }
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.CONTROL_PLANE_PORT || process.env.PORT || 4001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Arav Control Plane API is listening on 0.0.0.0:${port}`);
}

bootstrap();
