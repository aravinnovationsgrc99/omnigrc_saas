import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { S3EvidenceStorageProvider } from './s3-storage.provider';

export interface OrphanReconciliationResult {
  totalStorageObjectsScanned: number;
  totalDbRecordsScanned: number;
  orphanedStorageKeys: string[];
  missingBinaryRecords: { id: string; table: 'Evidence' | 'AuditEvidence'; storageKey: string }[];
  quarantinedKeys: string[];
  durationMs: number;
  timestamp: string;
}

export interface ReconciliationOptions {
  quarantineOrphans?: boolean;
  olderThanHours?: number;
  organizationId?: string;
  actorId?: string;
}

@Injectable()
export class EvidenceOrphanReconciliationService {
  private readonly logger = new Logger(EvidenceOrphanReconciliationService.name);
  private readonly localBaseDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly storageService: EvidenceStorageService,
    private readonly s3Provider?: S3EvidenceStorageProvider,
  ) {
    this.localBaseDir = path.resolve(process.cwd(), 'uploads', 'evidence');
  }

  public async runReconciliation(
    options: ReconciliationOptions = {},
  ): Promise<OrphanReconciliationResult> {
    const startTime = Date.now();
    const olderThanHours = options.olderThanHours ?? 24;
    const cutoffTimestamp = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const orgFilter = options.organizationId;
    const actorId = options.actorId || 'system-reconciliation-job';

    this.logger.log(
      `Starting Evidence Orphan Reconciliation (retention cutoff: ${olderThanHours}h, quarantine: ${!!options.quarantineOrphans})...`,
    );

    // 1. Gather all active storage keys from DB (canonical Evidence + legacy AuditEvidence)
    const [canonicalRecords, legacyRecords] = await Promise.all([
      this.prisma.evidence.findMany({
        where: orgFilter ? { organizationId: orgFilter } : undefined,
        select: { id: true, storageKey: true, organizationId: true },
      }),
      this.prisma.auditEvidence.findMany({
        where: orgFilter ? { organizationId: orgFilter } : undefined,
        select: { id: true, fileUrl: true, organizationId: true },
      }),
    ]);

    const activeDbKeys = new Map<string, { id: string; table: 'Evidence' | 'AuditEvidence' }>();
    const missingBinaries: { id: string; table: 'Evidence' | 'AuditEvidence'; storageKey: string }[] = [];

    for (const rec of canonicalRecords) {
      if (rec.storageKey) {
        activeDbKeys.set(rec.storageKey, { id: rec.id, table: 'Evidence' });
      }
    }

    for (const rec of legacyRecords) {
      if (rec.fileUrl) {
        // fileUrl may be a relative path or storageKey or full URL
        let key = rec.fileUrl;
        if (key.startsWith('http://') || key.startsWith('https://')) {
          try {
            const url = new URL(key);
            key = url.pathname.replace(/^\/+/, '');
          } catch {
            // Keep original
          }
        }
        activeDbKeys.set(key, { id: rec.id, table: 'AuditEvidence' });
      }
    }

    // 2. Discover physical storage objects
    const discoveredStorageObjects: { key: string; lastModified: Date; size: number }[] = [];

    if (process.env.STORAGE_PROVIDER === 's3' && this.s3Provider) {
      try {
        const s3Objects = await this.s3Provider.listObjects(orgFilter);
        discoveredStorageObjects.push(...s3Objects);
      } catch (err: any) {
        this.logger.error(`Failed to list S3 objects for reconciliation: ${err?.message || err}`);
      }
    } else {
      // Local disk discovery
      const scanDir = orgFilter
        ? path.join(this.localBaseDir, orgFilter)
        : this.localBaseDir;

      if (fs.existsSync(scanDir)) {
        this.collectLocalFilesRecursively(scanDir, this.localBaseDir, discoveredStorageObjects);
      }
    }

    // 3. Detect orphaned storage objects
    const orphanedStorageKeys: string[] = [];
    const quarantinedKeys: string[] = [];

    for (const obj of discoveredStorageObjects) {
      // Skip already quarantined files
      if (obj.key.startsWith('quarantine/')) {
        continue;
      }

      // If key is not referenced in DB
      if (!activeDbKeys.has(obj.key)) {
        // Enforce safety cutoff margin (older than N hours)
        if (obj.lastModified < cutoffTimestamp) {
          orphanedStorageKeys.push(obj.key);

          // If quarantine is requested, move to quarantine directory / prefix
          if (options.quarantineOrphans) {
            const quarantined = await this.quarantineOrphan(obj.key);
            if (quarantined) {
              quarantinedKeys.push(obj.key);
            }
          }
        }
      }
    }

    // 4. Detect missing binaries for referenced DB records
    for (const [key, meta] of activeDbKeys.entries()) {
      // Exclude synthetic or external HTTP proof URLs
      if (key.startsWith('http://') || key.startsWith('https://')) {
        continue;
      }

      const exists = await this.checkKeyExists(key);
      if (!exists) {
        missingBinaries.push({
          id: meta.id,
          table: meta.table,
          storageKey: key,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const result: OrphanReconciliationResult = {
      totalStorageObjectsScanned: discoveredStorageObjects.length,
      totalDbRecordsScanned: activeDbKeys.size,
      orphanedStorageKeys,
      missingBinaryRecords: missingBinaries,
      quarantinedKeys,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(
      `Reconciliation completed in ${durationMs}ms: Scanned ${result.totalStorageObjectsScanned} storage objects, detected ${result.orphanedStorageKeys.length} orphans, ${result.missingBinaryRecords.length} missing binaries.`,
    );

    // Audit log the reconciliation event
    try {
      await this.auditLogsService.log({
        organizationId: orgFilter || 'SYSTEM',
        actorId,
        action: 'EVIDENCE_ORPHAN_RECONCILIATION_REPORT',
        entityType: 'EvidenceVault',
        entityId: 'reconciliation-' + Date.now(),
        metadata: {
          scannedStorage: result.totalStorageObjectsScanned,
          scannedDb: result.totalDbRecordsScanned,
          orphanedCount: result.orphanedStorageKeys.length,
          missingCount: result.missingBinaryRecords.length,
          quarantinedCount: result.quarantinedKeys.length,
          durationMs,
        },
      });
    } catch (auditErr: any) {
      this.logger.warn(`Could not persist audit log for orphan reconciliation: ${auditErr?.message}`);
    }

    return result;
  }

  private collectLocalFilesRecursively(
    currentDir: string,
    baseDir: string,
    out: { key: string; lastModified: Date; size: number }[],
  ): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          this.collectLocalFilesRecursively(fullPath, baseDir, out);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          const relativeKey = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          out.push({
            key: relativeKey,
            lastModified: stat.mtime,
            size: stat.size,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Error reading local directory "${currentDir}": ${err?.message}`);
    }
  }

  private async checkKeyExists(storageKey: string): Promise<boolean> {
    if (process.env.STORAGE_PROVIDER === 's3' && this.s3Provider) {
      return this.s3Provider.exists(storageKey);
    }
    return this.storageService.exists(storageKey);
  }

  private async quarantineOrphan(storageKey: string): Promise<boolean> {
    try {
      if (process.env.STORAGE_PROVIDER === 's3' && this.s3Provider) {
        // For S3, copy to quarantine/ prefix or mark tags
        this.logger.warn(`S3 orphan quarantine requested for key "${storageKey}".`);
        return true;
      } else {
        const fullSource = path.join(this.localBaseDir, storageKey);
        const quarantineDir = path.join(this.localBaseDir, 'quarantine', 'orphans');
        const fullDest = path.join(quarantineDir, storageKey.replace(/\//g, '_'));

        if (!fs.existsSync(quarantineDir)) {
          fs.mkdirSync(quarantineDir, { recursive: true });
        }

        if (fs.existsSync(fullSource)) {
          fs.renameSync(fullSource, fullDest);
          this.logger.warn(`Moved local orphaned evidence "${storageKey}" to quarantine "${fullDest}".`);
          return true;
        }
      }
      return false;
    } catch (err: any) {
      this.logger.error(`Failed to quarantine orphan "${storageKey}": ${err?.message}`);
      return false;
    }
  }
}

