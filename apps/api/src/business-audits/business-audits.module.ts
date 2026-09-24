import { Module } from '@nestjs/common';
import { BusinessAuditsController } from './business-audits.controller';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LicenseVerificationModule } from '../license-verification/license-verification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, NotificationsModule, LicenseVerificationModule, AuthModule],
  controllers: [BusinessAuditsController],
  providers: [BusinessAuditsService],
  exports: [BusinessAuditsService],
})
export class BusinessAuditsModule {}
