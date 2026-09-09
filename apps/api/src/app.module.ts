import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { RegionalPodsModule } from './regional-pods/regional-pods.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AssetsModule } from './assets/assets.module';
import { RisksModule } from './risks/risks.module';
import { ControlsModule } from './controls/controls.module';
import { ComplianceTasksModule } from './compliance-tasks/compliance-tasks.module';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuthModule,
    RegionalPodsModule,
    AuditLogsModule,
    AssetsModule,
    RisksModule,
    ControlsModule,
    ComplianceTasksModule,
  ],
})
export class AppModule {}
