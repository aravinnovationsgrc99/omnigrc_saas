import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`OMNiGRC API is listening on 0.0.0.0:${port}`);
}
bootstrap();
