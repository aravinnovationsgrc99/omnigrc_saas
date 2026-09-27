import { Module } from '@nestjs/common';
import { OrganizationControlController } from './organization-control.controller';
import { OrganizationControlService } from './organization-control.service';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule],
  controllers: [OrganizationControlController],
  providers: [OrganizationControlService],
  exports: [OrganizationControlService],
})
export class OrganizationControlModule {}
