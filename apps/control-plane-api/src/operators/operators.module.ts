import { Module } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { OperatorsController } from './operators.controller';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule, OperatorAuthModule],
  providers: [OperatorsService],
  controllers: [OperatorsController],
  exports: [OperatorsService],
})
export class OperatorsModule {}
