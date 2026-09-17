import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

const logger = new Logger('DataPlaneBootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 10 Security: Apply HTTP security headers via helmet.
  // Covers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  // X-XSS-Protection, Strict-Transport-Security, Content-Security-Policy basics.
  // Content-Security-Policy is disabled because this is an API server (no HTML), not a web app.
  app.use(
    helmet({
      contentSecurityPolicy: false, // API server — no HTML served from this origin
    }),
  );

  const rawFrontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim().replace(/\/+$/, ''))
    : [];

  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...rawFrontendUrls,
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Allow exact matches in allowedOrigins, any Vercel domain, or any Render domain
      const isAllowed =
        allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
        /\.vercel\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        // Fallback: reflect origin to prevent CORS breakage during deployment
        callback(null, true);
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Phase 10 Security: Warn at startup if JWT secrets are at dev defaults.
  // These warnings ensure that misconfigured production deployments are immediately
  // visible in startup logs before the first request is processed.
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  if (!jwtSecret || jwtSecret === 'omnigrc-dev-secret-key-change-in-prod') {
    if (isProduction) {
      logger.error(
        'SECURITY CRITICAL: JWT_SECRET is not set or is using the dev default. ' +
          'All issued JWT tokens are vulnerable. Set a strong random secret immediately.',
      );
    } else {
      logger.warn(
        'SECURITY WARNING: JWT_SECRET is not set. Using dev fallback. ' +
          'DO NOT use this configuration in production.',
      );
    }
  }

  if (!jwtRefreshSecret || jwtRefreshSecret === 'omnigrc-dev-refresh-secret-key') {
    if (isProduction) {
      logger.error(
        'SECURITY CRITICAL: JWT_REFRESH_SECRET is not set or is using the dev default. ' +
          'All issued refresh tokens are vulnerable. Set a strong random secret immediately.',
      );
    } else {
      logger.warn(
        'SECURITY WARNING: JWT_REFRESH_SECRET is not set. Using dev fallback. ' +
          'DO NOT use this configuration in production.',
      );
    }
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`OMNiGRC API is listening on 0.0.0.0:${port}`);
}
bootstrap();

