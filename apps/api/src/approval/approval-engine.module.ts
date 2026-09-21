import { Module } from '@nestjs/common';
import { ApprovalEngineService } from './approval-engine.service';
import { ApprovalEngineController } from './approval-engine.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, NotificationsModule, AuthModule],
  providers: [ApprovalEngineService],
  controllers: [ApprovalEngineController],
  exports: [ApprovalEngineService],
})
export class ApprovalEngineModule {}
