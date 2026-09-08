import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { RegionalPodsModule } from './regional-pods/regional-pods.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuthModule,
    RegionalPodsModule,
    AuditLogsModule,
  ],
})
export class AppModule {}
