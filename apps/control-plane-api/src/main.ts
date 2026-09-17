import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const logger = new Logger('ControlPlaneBootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 10 Security: The Control Plane is a server-to-server internal API with no
  // direct browser clients. CORS is disabled by default.
  // Set CONTROL_PLANE_CORS_ORIGINS to a comma-separated list of allowed origins
  // only for internal Arav ops tooling that requires browser access.
  const corsOrigins = process.env.CONTROL_PLANE_CORS_ORIGINS;
  if (corsOrigins) {
    const allowedOrigins = corsOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    app.enableCors({ origin: allowedOrigins, credentials: false });
    logger.warn(
      `Control Plane CORS enabled for explicit origins: ${allowedOrigins.join(', ')}`,
    );
  } else {
    // CORS disabled: server-to-server calls do not require CORS headers.
    app.enableCors({ origin: false });
  }

  // Phase 10 Security: Warn at startup if admin key is not explicitly configured.
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
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
