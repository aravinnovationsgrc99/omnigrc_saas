import { Module } from '@nestjs/common';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { LicensesModule } from '../licenses/licenses.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';
import { ControlPlaneSystemService } from './system.service';
import { SystemController } from './system.controller';

@Module({
  imports: [
    ControlPlanePrismaModule,
    LicensesModule,
    ControlPlaneAuditLogsModule,
    OperatorAuthModule,
  ],
  controllers: [SystemController],
  providers: [ControlPlaneSystemService],
  exports: [ControlPlaneSystemService],
})
export class SystemModule {}
