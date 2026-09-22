import { Module } from '@nestjs/common';
import { DocumentIntelligenceController } from './document-intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentExtractionService } from './document-extraction.service';
import { AnalysisQueueService } from './analysis-queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { ControlsModule } from '../controls/controls.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    FrameworksModule,
    ControlsModule,
    AuthModule,
  ],
  controllers: [DocumentIntelligenceController],
  providers: [
    DocumentIntelligenceService,
    DocumentExtractionService,
    AnalysisQueueService,
  ],
  exports: [DocumentIntelligenceService, DocumentExtractionService],
})
export class DocumentIntelligenceModule {}
