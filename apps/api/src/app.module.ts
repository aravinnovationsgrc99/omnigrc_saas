import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { RegionalPodsModule } from './regional-pods/regional-pods.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AssetsModule } from './assets/assets.module';
import { RisksModule } from './risks/risks.module';
import { ControlsModule } from './controls/controls.module';
import { ComplianceTasksModule } from './compliance-tasks/compliance-tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    AuthModule,
    RegionalPodsModule,
    AuditLogsModule,
    AssetsModule,
    RisksModule,
    ControlsModule,
    ComplianceTasksModule,
    NotificationsModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
