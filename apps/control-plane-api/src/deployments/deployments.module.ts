import { Module } from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { LicensesModule } from '../licenses/licenses.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';

@Module({
  imports: [
    ControlPlanePrismaModule,
    ControlPlaneAuditLogsModule,
    LicensesModule,
    OperatorAuthModule,
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
