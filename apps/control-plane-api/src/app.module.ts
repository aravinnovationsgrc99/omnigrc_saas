import { Module } from '@nestjs/common';
import { ControlPlanePrismaModule } from './prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from './audit/audit-logs.module';
import { CustomersModule } from './customers/customers.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { LicensesModule } from './licenses/licenses.module';
import { EntitlementsModule } from './entitlements/entitlements.module';

@Module({
  imports: [
    ControlPlanePrismaModule,
    ControlPlaneAuditLogsModule,
    CustomersModule,
    DeploymentsModule,
    LicensesModule,
    EntitlementsModule,
  ],
})
export class AppModule {}
