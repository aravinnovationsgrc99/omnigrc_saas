import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  RegulatorySource,
  RegulatoryHealthStatus,
  RegulatoryPublicationState,
} from '@prisma/client';
import { RegulatorySourceAdapter } from './adapters/regulatory-source-adapter.interface';
import { RbiSourceAdapter } from './adapters/rbi-source.adapter';
import { SchedulerLockService } from '../notifications/cron/scheduler-lock.service';
import * as crypto from 'crypto';

export interface SourceSyncResult {
  sourceId: string;
  regulatorCode: string;
  success: boolean;
  totalDiscovered: number;
  newPublicationsCount: number;
  newVersionsCount: number;
  unchangedCount: number;
  diagnostics: Record<string, any>;
  errorMessage?: string;
}

@Injectable()
export class RegulatoryIngestionService {
  private readonly logger = new Logger(RegulatoryIngestionService.name);
  private readonly adapters: RegulatorySourceAdapter[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbiAdapter: RbiSourceAdapter,
    @Optional() private readonly schedulerLockService?: SchedulerLockService,
    @Optional() private readonly auditLogsService?: AuditLogsService,
  ) {
    // Register available regulatory adapters
    this.adapters.push(this.rbiAdapter);
  }

  /**
   * Returns matching adapter for a given regulatory source.
   */
  public getAdapterForSource(source: RegulatorySource): RegulatorySourceAdapter {
    const adapter = this.adapters.find((a) => a.canHandle(source));
    if (!adapter) {
      throw new BadRequestException(
        `No ingestion adapter available for regulator code "${source.regulatorCode}".`,
      );
    }
    return adapter;
  }

  /**
   * Generates a deterministic positive 64-bit integer lock ID from a string key
   * for PostgreSQL advisory locking.
   */
  public generateLockId(key: string): bigint {
    const hash = crypto.createHash('sha256').update(key).digest();
    const rawBigInt = hash.readBigInt64BE(0);
    // Ensure positive BigInt
    return rawBigInt < 0n ? -rawBigInt : rawBigInt;
  }

  /**
   * Syncs a single source with concurrency locking, deduplication, and immutable versioning.
   */
  public async syncSource(
    sourceId: string,
    context?: { actorId?: string; organizationId?: string },
  ): Promise<SourceSyncResult> {
    const source = await this.prisma.regulatorySource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new NotFoundException(`Regulatory source with ID "${sourceId}" not found.`);
    }

    if (!source.isEnabled) {
      throw new BadRequestException(`Regulatory source "${source.displayName}" is currently disabled.`);
    }

    const lockId = this.generateLockId(`reg-sync-${source.id}`);
    const executeSync = async (): Promise<SourceSyncResult> => {
      return this.performSourceSync(source, context);
    };

    if (this.schedulerLockService) {
      const lockRes = await this.schedulerLockService.withLock(
        lockId,
        `Sync-${source.regulatorCode}-${source.id}`,
        executeSync,
      );

      if (!lockRes.executed) {
        this.logger.warn(`Sync for source "${source.displayName}" is already in progress on another worker.`);
        return {
          sourceId: source.id,
          regulatorCode: source.regulatorCode,
          success: false,
          totalDiscovered: 0,
          newPublicationsCount: 0,
          newVersionsCount: 0,
          unchangedCount: 0,
          diagnostics: { reason: 'CONCURRENCY_LOCK_ACTIVE' },
          errorMessage: 'Source sync already in progress on another cluster worker.',
        };
      }

      return lockRes.result!;
    }

    return executeSync();
  }

  /**
   * Core ingestion pipeline for an enabled source.
   */
  private async performSourceSync(
    source: RegulatorySource,
    context?: { actorId?: string; organizationId?: string },
  ): Promise<SourceSyncResult> {
    const adapter = this.getAdapterForSource(source);
    const now = new Date();

    // Mark attempt
    await this.prisma.regulatorySource.update({
      where: { id: source.id },
      data: { lastAttemptedFetchAt: now },
    });

    try {
      // 1. Fetch & normalize through regulator-specific adapter
      const fetchResult = await adapter.fetchAndNormalize(source);

      let newPublicationsCount = 0;
      let newVersionsCount = 0;
      let unchangedCount = 0;

      // 2. Process each normalized item idempotently
      for (const item of fetchResult.items) {
        const itemResult = await this.processPublicationItem(source, item);
        if (itemResult.status === 'CREATED_NEW') {
          newPublicationsCount++;
        } else if (itemResult.status === 'CREATED_VERSION') {
          newVersionsCount++;
        } else {
          unchangedCount++;
        }
      }

      // 3. Compute next scheduled fetch time based on polling interval
      const nextScheduled = new Date(now.getTime() + source.pollingIntervalMinutes * 60 * 1000);

      // 4. Update source health and diagnostics
      await this.prisma.regulatorySource.update({
        where: { id: source.id },
        data: {
          healthStatus: RegulatoryHealthStatus.HEALTHY,
          lastSuccessfulFetchAt: now,
          nextScheduledFetchAt: nextScheduled,
          lastErrorMessage: null,
          sanitizedDiagnostics: {
            ...fetchResult.diagnostics,
            newPublicationsCount,
            newVersionsCount,
            unchangedCount,
          },
        },
      });

      // 5. Audit log administrative or system sync outcome
      if (this.auditLogsService && context?.organizationId && context?.actorId) {
        try {
          await this.auditLogsService.log({
            organizationId: context.organizationId,
            actorId: context.actorId,
            action: 'REGULATORY_SOURCE_SYNC',
            entityType: 'REGULATORY_SOURCE',
            entityId: source.id,
            metadata: {
              regulatorCode: source.regulatorCode,
              endpoint: source.configuredEndpoint,
              totalDiscovered: fetchResult.items.length,
              newPublicationsCount,
              newVersionsCount,
              unchangedCount,
            },
          });
        } catch (auditErr: any) {
          this.logger.warn(`Non-fatal audit log error during source sync: ${auditErr.message}`);
        }
      }

      return {
        sourceId: source.id,
        regulatorCode: source.regulatorCode,
        success: true,
        totalDiscovered: fetchResult.items.length,
        newPublicationsCount,
        newVersionsCount,
        unchangedCount,
        diagnostics: fetchResult.diagnostics,
      };
    } catch (err: any) {
      this.logger.error(`Sync failure for regulatory source "${source.displayName}": ${err.message}`, err.stack);

      // Update source failure status safely
      await this.prisma.regulatorySource.update({
        where: { id: source.id },
        data: {
          healthStatus: RegulatoryHealthStatus.FAILING,
          lastErrorMessage: err.message?.substring(0, 500) || 'Unknown fetch error',
          sanitizedDiagnostics: {
            failedAt: now.toISOString(),
            errorType: err.name || 'Error',
            message: err.message?.substring(0, 300),
          },
        },
      });

      return {
        sourceId: source.id,
        regulatorCode: source.regulatorCode,
        success: false,
        totalDiscovered: 0,
        newPublicationsCount: 0,
        newVersionsCount: 0,
        unchangedCount: 0,
        diagnostics: { error: err.message },
        errorMessage: err.message,
      };
    }
  }

  /**
   * Idempotently processes an individual publication item:
   * - Deduplicates by externalId or canonicalUrl
   * - Creates publication + initial version if new
   * - Creates immutable new version if content changed
   * - Leaves versions untouched if content hash unchanged
   */
  public async processPublicationItem(
    source: RegulatorySource,
    item: {
      externalId?: string;
      canonicalUrl: string;
      title: string;
      publicationNumber?: string;
      publicationDate?: Date;
      rawContent?: string;
      contentHash: string;
      documentUrls?: string[];
      rawMetadata?: Record<string, any>;
    },
  ): Promise<{ status: 'CREATED_NEW' | 'CREATED_VERSION' | 'UNCHANGED'; publicationId: string }> {
    const now = new Date();

    // 1. Locate existing publication by externalId (if provided) or canonicalUrl
    let existingPublication: any = null;

    if (item.externalId) {
      existingPublication = await this.prisma.regulatoryPublication.findFirst({
        where: {
          sourceId: source.id,
          externalId: item.externalId,
        },
      });
    }

    if (!existingPublication) {
      existingPublication = await this.prisma.regulatoryPublication.findFirst({
        where: {
          sourceId: source.id,
          canonicalUrl: item.canonicalUrl,
        },
      });
    }

    // CASE A: NEW PUBLICATION
    if (!existingPublication) {
      const created = await this.prisma.regulatoryPublication.create({
        data: {
          sourceId: source.id,
          catalogueEntryId: source.catalogueEntryId,
          externalId: item.externalId,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          publicationNumber: item.publicationNumber,
          publicationDate: item.publicationDate || now,
          firstDiscoveredAt: now,
          lastObservedAt: now,
          contentHash: item.contentHash,
          currentVersionNumber: 1,
          currentDocumentMetadata: {
            documentUrls: item.documentUrls || [],
            ...item.rawMetadata,
          },
          processingState: RegulatoryPublicationState.DISCOVERED,
          versions: {
            create: {
              versionNumber: 1,
              contentSha256: item.contentHash,
              retrievedAt: now,
              contentType: 'text/html; charset=utf-8',
              byteSize: Buffer.byteLength(item.rawContent || item.title, 'utf8'),
              documentUrl: item.canonicalUrl,
              reasonForVersion: 'INITIAL_INGESTION',
              rawMetadata: item.rawMetadata || {},
            },
          },
        },
      });

      return { status: 'CREATED_NEW', publicationId: created.id };
    }

    // CASE B: PUBLICATION ALREADY EXISTS
    // Check if content hash changed
    if (existingPublication.contentHash === item.contentHash) {
      // Content has not changed: update last observed timestamp
      await this.prisma.regulatoryPublication.update({
        where: { id: existingPublication.id },
        data: {
          lastObservedAt: now,
          publicationNumber: item.publicationNumber || existingPublication.publicationNumber,
        },
      });

      return { status: 'UNCHANGED', publicationId: existingPublication.id };
    }

    // CASE C: CONTENT CHANGED — CREATE IMMUTABLE NEW VERSION
    const newVersionNumber = existingPublication.currentVersionNumber + 1;

    // Transactionally update publication and insert new version record
    await this.prisma.$transaction(async (tx) => {
      // 1. Mark existing current version as superseded
      await tx.regulatoryPublicationVersion.updateMany({
        where: {
          publicationId: existingPublication.id,
          supersededAt: null,
        },
        data: {
          supersededAt: now,
        },
      });

      // 2. Insert new version record
      await tx.regulatoryPublicationVersion.create({
        data: {
          publicationId: existingPublication.id,
          versionNumber: newVersionNumber,
          contentSha256: item.contentHash,
          retrievedAt: now,
          contentType: 'text/html; charset=utf-8',
          byteSize: Buffer.byteLength(item.rawContent || item.title, 'utf8'),
          documentUrl: item.canonicalUrl,
          reasonForVersion: 'CONTENT_UPDATE_DETECTED',
          rawMetadata: item.rawMetadata || {},
        },
      });

      // 3. Update publication current metadata
      await tx.regulatoryPublication.update({
        where: { id: existingPublication.id },
        data: {
          title: item.title,
          publicationNumber: item.publicationNumber || existingPublication.publicationNumber,
          contentHash: item.contentHash,
          currentVersionNumber: newVersionNumber,
          lastObservedAt: now,
          currentDocumentMetadata: {
            documentUrls: item.documentUrls || [],
            ...item.rawMetadata,
          },
        },
      });
    });

    return { status: 'CREATED_VERSION', publicationId: existingPublication.id };
  }
}
