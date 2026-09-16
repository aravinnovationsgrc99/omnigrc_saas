import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.CONTROL_PLANE_PORT || process.env.PORT || 4001;
  await app.listen(port, '0.0.0.0');
  console.log(`Arav Control Plane API is listening on 0.0.0.0:${port}`);
}

bootstrap();
