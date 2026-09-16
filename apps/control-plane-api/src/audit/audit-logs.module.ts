import { Module, Global } from '@nestjs/common';
import { ControlPlaneAuditLogsService } from './audit-logs.service';

@Global()
@Module({
  providers: [ControlPlaneAuditLogsService],
  exports: [ControlPlaneAuditLogsService],
})
export class ControlPlaneAuditLogsModule {}
