import { Module } from '@nestjs/common';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OrganizationControlModule } from '../organization-control/organization-control.module';
import { ServiceControlModule } from '../service-control/service-control.module';
import { DeploymentsModule } from '../deployments/deployments.module';
import { LicensesModule } from '../licenses/licenses.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';

@Module({
  imports: [
    ControlPlanePrismaModule,
    ControlPlaneAuditLogsModule,
    OperatorAuthModule,
    OrganizationControlModule,
    ServiceControlModule,
    DeploymentsModule,
    LicensesModule,
  ],
  controllers: [BreakGlassController],
  providers: [BreakGlassService],
  exports: [BreakGlassService],
})
export class BreakGlassModule {}
