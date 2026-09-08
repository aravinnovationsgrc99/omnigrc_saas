import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { RegionalPodsModule } from './regional-pods/regional-pods.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AuthModule,
    RegionalPodsModule,
    AuditLogsModule,
    AssetsModule,
  ],
})
export class AppModule {}
