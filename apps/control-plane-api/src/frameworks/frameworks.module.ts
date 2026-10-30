import { Module } from '@nestjs/common';
import { DataPlanePrismaService } from './data-plane-prisma.service';
import { ControlPlaneFrameworksService } from './frameworks.service';
import { ControlPlaneFrameworksController } from './frameworks.controller';

@Module({
  controllers: [ControlPlaneFrameworksController],
  providers: [DataPlanePrismaService, ControlPlaneFrameworksService],
  exports: [ControlPlaneFrameworksService],
})
export class ControlPlaneFrameworksModule {}

