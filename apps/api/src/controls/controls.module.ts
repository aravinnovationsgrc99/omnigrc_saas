import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller';
import { ControlsService } from './controls.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { AiRouterService } from './ai/ai-router.service';
import { GeminiProvider } from './ai/gemini.provider';
import { ClaudeProvider } from './ai/claude.provider';
import { MockAiProvider } from './ai/mock-ai.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ControlsController],
  providers: [
    ControlsService,
    MappingQueueService,
    AiRouterService,
    GeminiProvider,
    ClaudeProvider,
    MockAiProvider,
  ],
  exports: [ControlsService],
})
export class ControlsModule {}
