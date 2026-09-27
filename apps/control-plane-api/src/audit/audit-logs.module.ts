import { Module } from '@nestjs/common';
import { ControlPlaneAuditLogsService } from './audit-logs.service';
import { RedactionService } from './redaction.service';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ControlPlanePrismaModule],
  providers: [ControlPlaneAuditLogsService, RedactionService],
  exports: [ControlPlaneAuditLogsService, RedactionService],
})
export class ControlPlaneAuditLogsModule {}
