import { Module } from '@nestjs/common';
import { EvidenceVaultService } from './evidence-vault.service';
import { EvidenceVaultController } from './evidence-vault.controller';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';
import { EvidenceStorageService } from './evidence-storage.service';
import { EvidenceScannerService } from './evidence-scanner.service';
import { ClamAvScannerEngine } from './clamav-scanner.engine';
import { S3EvidenceStorageProvider } from './s3-storage.provider';
import { EvidenceOrphanReconciliationService } from './evidence-orphan-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    AuthModule,
    MulterModule.register({
      limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB
      },
    }),
  ],
  providers: [
    EvidenceVaultService,
    EvidenceService,
    EvidenceStorageService,
    EvidenceScannerService,
    ClamAvScannerEngine,
    S3EvidenceStorageProvider,
    EvidenceOrphanReconciliationService,
  ],
  controllers: [EvidenceController, EvidenceVaultController],
  exports: [
    EvidenceVaultService,
    EvidenceService,
    EvidenceStorageService,
    EvidenceScannerService,
    ClamAvScannerEngine,
    S3EvidenceStorageProvider,
    EvidenceOrphanReconciliationService,
  ],
})
export class EvidenceVaultModule {}
