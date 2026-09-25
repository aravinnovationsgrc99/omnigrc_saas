import { Module } from '@nestjs/common';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationMembersController } from './organization-members.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { LicenseVerificationModule } from '../license-verification/license-verification.module';
import { FrameworksModule } from '../frameworks/frameworks.module';

@Module({
  imports: [AuditLogsModule, AuthModule, LicenseVerificationModule, FrameworksModule],
  controllers: [OrganizationMembersController],
  providers: [OrganizationMembersService],
  exports: [OrganizationMembersService],
})
export class OrganizationMembersModule {}

