import { Module } from '@nestjs/common';
import { ControlPlanePrismaModule } from './prisma/prisma.module';
import { DeploymentsModule } from './deployments/deployments.module';

@Module({
  imports: [ControlPlanePrismaModule, DeploymentsModule],
})
export class AppModule {}
