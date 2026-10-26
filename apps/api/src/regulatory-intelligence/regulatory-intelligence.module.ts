import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SsrfSafeHttpClientService } from './security/ssrf-safe-http-client.service';
import { RbiSourceAdapter } from './adapters/rbi-source.adapter';
import { RegulatoryCatalogueService } from './catalogue/regulatory-catalogue.service';
import { RegulatoryIngestionService } from './regulatory-ingestion.service';
import { RegulatorySchedulerService } from './regulatory-scheduler.service';
import { RegulatoryDocumentStorageService } from './storage/regulatory-document-storage.service';
import { RegulatoryIntelligenceController } from './regulatory-intelligence.controller';
import { SchedulerLockService } from '../notifications/cron/scheduler-lock.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [RegulatoryIntelligenceController],
  providers: [
    SsrfSafeHttpClientService,
    RbiSourceAdapter,
    RegulatoryCatalogueService,
    RegulatoryIngestionService,
    RegulatorySchedulerService,
    RegulatoryDocumentStorageService,
    SchedulerLockService,
  ],
  exports: [
    RegulatoryCatalogueService,
    RegulatoryIngestionService,
    SsrfSafeHttpClientService,
    RegulatoryDocumentStorageService,
  ],
})
export class RegulatoryIntelligenceModule {}
