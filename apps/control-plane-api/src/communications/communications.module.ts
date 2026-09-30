import { Module } from '@nestjs/common';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';
import { ControlPlaneCommunicationsService } from './communications.service';
import { CommunicationsController } from './communications.controller';
import { ControlPlaneEmailService } from './email.service';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule, OperatorAuthModule],
  controllers: [CommunicationsController],
  providers: [ControlPlaneCommunicationsService, ControlPlaneEmailService],
  exports: [ControlPlaneCommunicationsService],
})
export class CommunicationsModule {}
