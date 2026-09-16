import { Module } from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { LicensesModule } from '../licenses/licenses.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';

@Module({
  imports: [LicensesModule, ControlPlaneAuditLogsModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
