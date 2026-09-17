import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

import { VendorsModule } from './vendors/vendors.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { PoliciesModule } from './policies/policies.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Phase 10 Security: Global rate limiting to prevent brute force attacks.
    // Auth-specific routes apply tighter limits via @Throttle() decorators.
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000, // 60 seconds window
        limit: 100,  // 100 requests per 60s per IP (generous for legitimate use)
      },
      {
        name: 'auth',
        ttl: 60000,  // 60 seconds window
        limit: 10,   // 10 requests per 60s per IP for auth endpoints
      },
    ]),
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
    VendorsModule,
    VulnerabilitiesModule,
    PoliciesModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
    // Phase 10 Security: Apply global rate limiting guard before other guards.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
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
