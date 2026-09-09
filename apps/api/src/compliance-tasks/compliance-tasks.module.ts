import { Module } from '@nestjs/common';
import { ComplianceTasksController } from './compliance-tasks.controller';
import { ComplianceTasksService } from './compliance-tasks.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ComplianceTasksController],
  providers: [ComplianceTasksService],
  exports: [ComplianceTasksService],
})
export class ComplianceTasksModule {}
