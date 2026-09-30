import { Module } from '@nestjs/common';
import { ControlPlaneAuditLogsService } from './audit-logs.service';
import { RedactionService } from './redaction.service';
import { AuditLogsController } from './audit-logs.controller';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ControlPlanePrismaModule],
  controllers: [AuditLogsController],
  providers: [ControlPlaneAuditLogsService, RedactionService],
  exports: [ControlPlaneAuditLogsService, RedactionService],
})
export class ControlPlaneAuditLogsModule {}
