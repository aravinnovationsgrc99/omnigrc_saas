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
import {
  RegulatorySourceAdapter,
  NormalizedPublicationItem,
} from './adapters/regulatory-source-adapter.interface';
import { RbiSourceAdapter } from './adapters/rbi-source.adapter';
import { SchedulerLockService } from '../notifications/cron/scheduler-lock.service';
import { SsrfSecurityException } from './security/ssrf-safe-http-client.service';
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

export interface ClassifiedSyncError {
  isPermanent: boolean;
  category:
    | 'SECURITY_SSRF'
    | 'CONFIGURATION_ERROR'
    | 'FORMAT_ERROR'
    | 'HTTP_CLIENT_ERROR'
    | 'TRANSIENT_NETWORK'
    | 'UNKNOWN';
  retryAfterSeconds?: number;
}

/**
 * Classifies an ingestion sync failure into permanent vs transient errors.
 * Permanent errors (SSRF, malformed URL, HTTP 404, invalid feed structure) pause the source.
 * Transient errors (timeout, 5xx, rate limits) trigger bounded exponential backoff.
 */
export function classifySyncError(err: any): ClassifiedSyncError {
  const message = (err?.message || '').toLowerCase();

  // 1. SSRF security violations are permanent policy blocks
  if (
    err instanceof SsrfSecurityException ||
    message.includes('ssrf security violation') ||
    message.includes('prohibited ip') ||
    message.includes('not authorized')
  ) {
    return { isPermanent: true, category: 'SECURITY_SSRF' };
  }

  // 2. Configuration, scheme, and URL syntax errors
  if (
    message.includes('malformed url') ||
    message.includes('insecure scheme') ||
    message.includes('embedded user credentials')
  ) {
    return { isPermanent: true, category: 'CONFIGURATION_ERROR' };
  }

  // 3. Document or feed format errors
  if (
    message.includes('not a valid rss') ||
    message.includes('file signature mismatch') ||
    message.includes('unsupported content-type')
  ) {
    return { isPermanent: true, category: 'FORMAT_ERROR' };
  }

  // 4. HTTP 4xx client errors (400, 401, 403, 404, 410, 422)
  if (
    message.includes('http 400') ||
    message.includes('http 401') ||
    message.includes('http 403') ||
    message.includes('http 404') ||
    message.includes('http 410') ||
    message.includes('http 422')
  ) {
    return { isPermanent: true, category: 'HTTP_CLIENT_ERROR' };
  }

  // 5. Rate limiting with Retry-After header
  let retryAfterSeconds: number | undefined;
  if (err?.headers?.['retry-after'] || message.includes('retry-after')) {
    const rawHeader = err?.headers?.['retry-after'] || '';
    const parsedSec = parseInt(rawHeader, 10);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      retryAfterSeconds = parsedSec;
    }
  }

  // 6. Network timeouts and 5xx transient server errors
  if (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('http 500') ||
    message.includes('http 502') ||
    message.includes('http 503') ||
    message.includes('http 504') ||
    message.includes('network stream error')
  ) {
    return { isPermanent: false, category: 'TRANSIENT_NETWORK', retryAfterSeconds };
  }

  return { isPermanent: false, category: 'UNKNOWN', retryAfterSeconds };
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
   * Uses bitwise AND with 0x7FFFFFFFFFFFFFFFn to guarantee a signed 64-bit non-negative integer,
   * safely preventing the -2^63 BigInt sign inversion overflow in PostgreSQL.
   */
  public generateLockId(key: string): bigint {
    const hash = crypto.createHash('sha256').update(key).digest();
    const rawBigInt = hash.readBigInt64BE(0);
    return rawBigInt & 0x7FFFFFFFFFFFFFFFn;
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

      // 3. Compute next scheduled fetch time based on normal configured polling interval
      const nextScheduled = new Date(now.getTime() + source.pollingIntervalMinutes * 60 * 1000);

      // 4. Update source: reset consecutiveFailures = 0, isPaused = false, and set HEALTHY
      await this.prisma.regulatorySource.update({
        where: { id: source.id },
        data: {
          healthStatus: RegulatoryHealthStatus.HEALTHY,
          isPaused: false,
          consecutiveFailures: 0,
          lastSuccessfulFetchAt: now,
          nextScheduledFetchAt: nextScheduled,
          lastErrorMessage: null,
          sanitizedDiagnostics: {
            ...fetchResult.diagnostics,
            newPublicationsCount,
            newVersionsCount,
            unchangedCount,
            consecutiveFailures: 0,
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

      // 1. Classify failure into permanent vs transient
      const classification = classifySyncError(err);
      const failures = (source.consecutiveFailures || 0) + 1;

      let nextScheduled: Date;
      let healthStatus: RegulatoryHealthStatus;
      let isPaused: boolean;
      let delayMinutes: number;

      if (classification.isPermanent) {
        // Permanent failure: pause source from normal 15-minute polling ticks.
        // Set next retry to 24 hours (1440m) as safety backstop until administrator intervenes.
        healthStatus = RegulatoryHealthStatus.PAUSED;
        isPaused = true;
        delayMinutes = 1440;
        nextScheduled = new Date(now.getTime() + delayMinutes * 60 * 1000);
      } else {
        // Transient failure: bounded exponential backoff
        // If Retry-After provided, respect it; otherwise back off: 15m * 2^(failures - 1) capped at 24h
        healthStatus = RegulatoryHealthStatus.FAILING;
        isPaused = false;
        if (classification.retryAfterSeconds) {
          delayMinutes = Math.min(1440, Math.ceil(classification.retryAfterSeconds / 60));
        } else {
          delayMinutes = Math.min(1440, 15 * Math.pow(2, Math.min(failures - 1, 6)));
        }
        nextScheduled = new Date(now.getTime() + delayMinutes * 60 * 1000);
      }

      // Update source failure state, backoff schedule, and sanitized diagnostics
      await this.prisma.regulatorySource.update({
        where: { id: source.id },
        data: {
          healthStatus,
          isPaused,
          consecutiveFailures: failures,
          nextScheduledFetchAt: nextScheduled,
          lastErrorMessage: err.message?.substring(0, 500) || 'Unknown fetch error',
          sanitizedDiagnostics: {
            failedAt: now.toISOString(),
            errorType: err.name || 'Error',
            category: classification.category,
            isPermanent: classification.isPermanent,
            consecutiveFailures: failures,
            delayMinutes,
            nextScheduledRetry: nextScheduled.toISOString(),
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
        diagnostics: {
          error: err.message,
          category: classification.category,
          isPermanent: classification.isPermanent,
          consecutiveFailures: failures,
          delayMinutes,
        },
        errorMessage: err.message,
      };
    }
  }

  /**
   * Idempotently processes an individual publication item:
   * - Deduplicates by externalId or canonicalUrl
   * - Decouples feed metadata from substantive content
   * - Updates metadata without creating versions on title-only changes
   * - Creates immutable new version only when substantive content hash changes
   */
  public async processPublicationItem(
    source: RegulatorySource,
    item: NormalizedPublicationItem,
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

    const substantiveHash = item.documentBytesSha256 || item.feedContentHash || item.contentHash;

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
          contentHash: substantiveHash,
          feedContentHash: item.feedContentHash,
          documentBytesSha256: item.documentBytesSha256,
          isDocumentBytesVerified: item.isDocumentBytesVerified ?? false,
          currentVersionNumber: 1,
          currentDocumentMetadata: {
            documentUrls: item.documentUrls || [],
            ...item.rawMetadata,
          },
          processingState: RegulatoryPublicationState.DISCOVERED,
          versions: {
            create: {
              versionNumber: 1,
              contentSha256: substantiveHash,
              feedContentHash: item.feedContentHash,
              documentBytesSha256: item.documentBytesSha256,
              isDocumentBytesVerified: item.isDocumentBytesVerified ?? false,
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
    // Compare substantive content hash (documentBytesSha256 or feedContentHash)
    const existingSubstantiveHash =
      existingPublication.documentBytesSha256 ||
      existingPublication.feedContentHash ||
      existingPublication.contentHash;

    const isContentUnchanged = existingSubstantiveHash === substantiveHash;

    if (isContentUnchanged) {
      // Substantive content has NOT changed.
      // Update publication metadata (title, publicationNumber, publicationDate) without creating a new version!
      await this.prisma.regulatoryPublication.update({
        where: { id: existingPublication.id },
        data: {
          lastObservedAt: now,
          title: item.title,
          publicationNumber: item.publicationNumber || existingPublication.publicationNumber,
          publicationDate: item.publicationDate || existingPublication.publicationDate,
          currentDocumentMetadata: {
            documentUrls: item.documentUrls || [],
            ...item.rawMetadata,
          },
        },
      });

      return { status: 'UNCHANGED', publicationId: existingPublication.id };
    }

    // CASE C: SUBSTANTIVE CONTENT CHANGED — CREATE IMMUTABLE NEW VERSION
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

      // 2. Insert new immutable version record
      await tx.regulatoryPublicationVersion.create({
        data: {
          publicationId: existingPublication.id,
          versionNumber: newVersionNumber,
          contentSha256: substantiveHash,
          feedContentHash: item.feedContentHash,
          documentBytesSha256: item.documentBytesSha256,
          isDocumentBytesVerified: item.isDocumentBytesVerified ?? false,
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
          publicationDate: item.publicationDate || existingPublication.publicationDate,
          contentHash: substantiveHash,
          feedContentHash: item.feedContentHash,
          documentBytesSha256: item.documentBytesSha256,
          isDocumentBytesVerified: item.isDocumentBytesVerified ?? false,
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
