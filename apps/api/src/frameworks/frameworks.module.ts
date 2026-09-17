import { Module } from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { FrameworksController } from './frameworks.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FrameworksService],
  controllers: [FrameworksController],
  exports: [FrameworksService],
})
export class FrameworksModule {}
