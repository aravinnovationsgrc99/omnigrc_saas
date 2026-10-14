import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { RemediationModule } from '../remediation/remediation.module';
import { ServiceControlModule } from '../service-control/service-control.module';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [PrismaModule, AuthModule, FrameworksModule, RemediationModule, ServiceControlModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
