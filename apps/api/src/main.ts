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
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
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
