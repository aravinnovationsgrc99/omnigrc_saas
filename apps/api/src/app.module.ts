import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
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
import { HealthModule } from './health/health.module';
import { LicenseVerificationModule } from './license-verification/license-verification.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';
import { LicenseWriteGuard } from './common/guards/license-write.guard';

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
    HealthModule,
    LicenseVerificationModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: LicenseWriteGuard,
    },
  ],
})
export class AppModule implements NestModule {

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
