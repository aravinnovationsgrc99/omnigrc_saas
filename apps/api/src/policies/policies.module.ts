import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { PoliciesController } from './policies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { ApprovalEngineModule } from '../approval/approval-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClaudeProvider } from '../controls/ai/claude.provider';
import { GeminiProvider } from '../controls/ai/gemini.provider';

@Module({
  imports: [PrismaModule, AuditLogsModule, AuthModule, ApprovalEngineModule, NotificationsModule],
  controllers: [PoliciesController],
  providers: [PoliciesService, ClaudeProvider, GeminiProvider],
  exports: [PoliciesService],
})
export class PoliciesModule {}
