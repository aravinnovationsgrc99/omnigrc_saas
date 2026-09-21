import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller';
import { ControlsService } from './controls.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { AiRouterService } from './ai/ai-router.service';
import { GeminiProvider } from './ai/gemini.provider';
import { ClaudeProvider } from './ai/claude.provider';
import { MockAiProvider } from './ai/mock-ai.provider';
import { GrcIntelligenceController } from './ai/intelligence.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, FrameworksModule],
  controllers: [ControlsController, GrcIntelligenceController],
  providers: [
    ControlsService,
    MappingQueueService,
    AiRouterService,
    GeminiProvider,
    ClaudeProvider,
    MockAiProvider,
  ],
  exports: [ControlsService, AiRouterService],
})
export class ControlsModule {}
