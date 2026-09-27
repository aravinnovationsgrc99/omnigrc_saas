import { Module } from '@nestjs/common';
import { ServiceControlController } from './service-control.controller';
import { ServiceControlService } from './service-control.service';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';

@Module({
  imports: [ControlPlanePrismaModule, ControlPlaneAuditLogsModule],
  controllers: [ServiceControlController],
  providers: [ServiceControlService],
  exports: [ServiceControlService],
})
export class ServiceControlModule {}
