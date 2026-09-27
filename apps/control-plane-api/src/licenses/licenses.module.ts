import { Module } from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { LicenseSigningService } from './license-signing.service';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule, OperatorAuthModule],
  controllers: [LicensesController],
  providers: [LicensesService, LicenseSigningService],
  exports: [LicensesService, LicenseSigningService],
})
export class LicensesModule {}
