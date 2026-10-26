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

import { ObligationExtractorService } from './obligations/obligation-extractor.service';
import { RegulatoryObligationService } from './obligations/regulatory-obligation.service';
import { ApplicabilityEngineService } from './applicability/applicability-engine.service';
import { RegulatoryApplicabilityService } from './applicability/regulatory-applicability.service';

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
    ObligationExtractorService,
    RegulatoryObligationService,
    ApplicabilityEngineService,
    RegulatoryApplicabilityService,
  ],
  exports: [
    RegulatoryCatalogueService,
    RegulatoryIngestionService,
    SsrfSafeHttpClientService,
    RegulatoryDocumentStorageService,
    ObligationExtractorService,
    RegulatoryObligationService,
    ApplicabilityEngineService,
    RegulatoryApplicabilityService,
  ],
})
export class RegulatoryIntelligenceModule {}
