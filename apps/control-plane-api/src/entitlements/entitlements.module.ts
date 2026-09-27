import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsController } from './entitlements.controller';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';
import { OperatorAuthModule } from '../auth/operator-auth.module';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule, OperatorAuthModule],
  controllers: [EntitlementsController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
