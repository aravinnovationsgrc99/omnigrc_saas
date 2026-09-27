import { Module } from '@nestjs/common';
import { ControlPlanePrismaModule } from './prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from './audit/audit-logs.module';
import { OperatorAuthModule } from './auth/operator-auth.module';
import { OperatorsModule } from './operators/operators.module';
import { CustomersModule } from './customers/customers.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { LicensesModule } from './licenses/licenses.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { OrganizationControlModule } from './organization-control/organization-control.module';

@Module({
  imports: [
    ControlPlanePrismaModule,
    ControlPlaneAuditLogsModule,
    OperatorAuthModule,
    OperatorsModule,
    CustomersModule,
    DeploymentsModule,
    LicensesModule,
    EntitlementsModule,
    OrganizationControlModule,
  ],
})
export class AppModule {}
