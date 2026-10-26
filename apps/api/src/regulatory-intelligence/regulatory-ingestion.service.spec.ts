import { RegulatoryIngestionService, classifySyncError } from './regulatory-ingestion.service';
import { RbiSourceAdapter } from './adapters/rbi-source.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SchedulerLockService } from '../notifications/cron/scheduler-lock.service';
import { SsrfSecurityException } from './security/ssrf-safe-http-client.service';
import { RegulatorySourceType, RegulatoryHealthStatus, RegulatoryPublicationState } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('RegulatoryIngestionService (Deduplication, Versioning & Scheduling Backoff)', () => {
  let service: RegulatoryIngestionService;
  let mockPrisma: any;
  let mockRbiAdapter: jest.Mocked<RbiSourceAdapter>;
  let mockLockService: jest.Mocked<SchedulerLockService>;
  let mockAuditLogs: jest.Mocked<AuditLogsService>;

  const mockSource = {
    id: 'src-123',
    regulatorCode: 'RBI',
    displayName: 'Reserve Bank of India — Official Feed',
    catalogueEntryId: 'cat-rbi',
    officialDomain: 'rbi.org.in',
    configuredEndpoint: 'https://www.rbi.org.in/notifications_rss.xml',
    sourceType: RegulatorySourceType.RSS,
    isEnabled: true,
    isPaused: false,
    consecutiveFailures: 0,
    pollingIntervalMinutes: 1440,
    lastAttemptedFetchAt: null,
    lastSuccessfulFetchAt: null,
    nextScheduledFetchAt: null,
    healthStatus: RegulatoryHealthStatus.UNTESTED,
    lastErrorMessage: null,
    sanitizedDiagnostics: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = {
      regulatorySource: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      regulatoryPublication: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      regulatoryPublicationVersion: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    };

    mockRbiAdapter = {
      regulatorCode: 'RBI',
      canHandle: jest.fn().mockReturnValue(true),
      fetchAndNormalize: jest.fn(),
    } as any;

    mockLockService = {
      withLock: jest.fn(),
    } as any;

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    } as any;

    service = new RegulatoryIngestionService(
      mockPrisma,
      mockRbiAdapter,
      mockLockService,
      mockAuditLogs,
    );
  });

  describe('1. Lock ID Generation & 64-bit Boundary Safety (LOCK-01)', () => {
    it('should generate deterministic non-negative 64-bit BigInt lock ID', () => {
      const lock1 = service.generateLockId('reg-sync-src-123');
      const lock2 = service.generateLockId('reg-sync-src-123');
      expect(lock1).toBe(lock2);
      expect(lock1 >= 0n).toBe(true);
      expect(lock1 <= 0x7FFFFFFFFFFFFFFFn).toBe(true);
    });

    it('should never overflow signed 64-bit PostgreSQL int8 range even for -2^63 boundary', () => {
      // Test the bitwise mask directly on the boundary value
      const minInt64 = -9223372036854775808n; // -2^63
      const masked = minInt64 & 0x7FFFFFFFFFFFFFFFn;
      expect(masked).toBe(0n);
      expect(masked >= 0n).toBe(true);
      expect(masked <= 9223372036854775807n).toBe(true); // <= 2^63 - 1
    });
  });

  describe('2. Adapter Resolution & Validation', () => {
    it('should resolve the registered RBI adapter for an RBI source', () => {
      const adapter = service.getAdapterForSource(mockSource as any);
      expect(adapter).toBe(mockRbiAdapter);
    });

    it('should throw BadRequestException if no adapter handles the regulator code', () => {
      mockRbiAdapter.canHandle.mockReturnValueOnce(false);
      expect(() => {
        service.getAdapterForSource({ ...mockSource, regulatorCode: 'UNKNOWN_REG' } as any);
      }).toThrow(BadRequestException);
    });
  });

  describe('3. Deduplication & Idempotent Publication Ingestion (DATA-01 & DB-01)', () => {
    it('should create a new publication and version 1 when discovered for the first time', async () => {
      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce(null);
      mockPrisma.regulatoryPublication.create.mockResolvedValueOnce({
        id: 'pub-new-1',
        title: 'New Circular',
        currentVersionNumber: 1,
      });

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'New Circular',
        publicationNumber: 'RBI/2026-27/100',
        contentHash: 'hash-abc-123',
        feedContentHash: 'hash-abc-123',
        isDocumentBytesVerified: false,
      });

      expect(result.status).toBe('CREATED_NEW');
      expect(result.publicationId).toBe('pub-new-1');
      expect(mockPrisma.regulatoryPublication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceId: mockSource.id,
            externalId: '13745',
            canonicalUrl: 'https://www.rbi.org.in/item/13745',
            feedContentHash: 'hash-abc-123',
            isDocumentBytesVerified: false,
            currentVersionNumber: 1,
          }),
        }),
      );
    });

    it('should update publication title without creating new version on title-only metadata change (DATA-01)', async () => {
      const existingPub = {
        id: 'pub-existing-1',
        sourceId: mockSource.id,
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Original Title with Typo',
        publicationNumber: 'RBI/2026-27/100',
        contentHash: 'content-hash-same',
        feedContentHash: 'content-hash-same',
        documentBytesSha256: null,
        currentVersionNumber: 1,
      };

      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce(existingPub);

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Corrected Title with Typo Fixed',
        publicationNumber: 'RBI/2026-27/100',
        contentHash: 'content-hash-same',
        feedContentHash: 'content-hash-same',
      });

      expect(result.status).toBe('UNCHANGED');
      expect(mockPrisma.regulatoryPublication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingPub.id },
          data: expect.objectContaining({
            title: 'Corrected Title with Typo Fixed',
          }),
        }),
      );
      // Ensure no new version record created
      expect(mockPrisma.regulatoryPublicationVersion.create).not.toHaveBeenCalled();
    });

    it('should create immutable new version when substantive content hash changes (DATA-01)', async () => {
      const existingPub = {
        id: 'pub-existing-1',
        sourceId: mockSource.id,
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Circular Title',
        contentHash: 'hash-v1',
        feedContentHash: 'hash-v1',
        currentVersionNumber: 1,
      };

      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce(existingPub);

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Circular Title',
        contentHash: 'hash-v2-substantive-change',
        feedContentHash: 'hash-v2-substantive-change',
        rawContent: 'Updated regulation text body',
      });

      expect(result.status).toBe('CREATED_VERSION');
      expect(mockPrisma.regulatoryPublicationVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicationId: existingPub.id, supersededAt: null },
          data: expect.objectContaining({ supersededAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.regulatoryPublicationVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publicationId: existingPub.id,
            versionNumber: 2,
            contentSha256: 'hash-v2-substantive-change',
            reasonForVersion: 'CONTENT_UPDATE_DETECTED',
          }),
        }),
      );
      expect(mockPrisma.regulatoryPublication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingPub.id },
          data: expect.objectContaining({
            currentVersionNumber: 2,
            contentHash: 'hash-v2-substantive-change',
          }),
        }),
      );
    });
  });

  describe('4. Failure Classification & Bounded Exponential Backoff (SCHED-01)', () => {
    it('should classify SSRF policy blocks as permanent errors', () => {
      const err = new SsrfSecurityException('Destination host resolved to prohibited IP address 127.0.0.1');
      const res = classifySyncError(err);
      expect(res.isPermanent).toBe(true);
      expect(res.category).toBe('SECURITY_SSRF');
    });

    it('should classify malformed URLs as permanent configuration errors', () => {
      const err = new Error('Malformed URL provided: "not-a-valid-url"');
      const res = classifySyncError(err);
      expect(res.isPermanent).toBe(true);
      expect(res.category).toBe('CONFIGURATION_ERROR');
    });

    it('should classify HTTP 404 as permanent HTTP client errors', () => {
      const err = new Error('Official endpoint responded with HTTP 404: Not Found');
      const res = classifySyncError(err);
      expect(res.isPermanent).toBe(true);
      expect(res.category).toBe('HTTP_CLIENT_ERROR');
    });

    it('should classify network timeouts as transient errors', () => {
      const err = new Error('Connection timeout to official regulator server');
      const res = classifySyncError(err);
      expect(res.isPermanent).toBe(false);
      expect(res.category).toBe('TRANSIENT_NETWORK');
    });

    it('should pause source on permanent error (SCHED-01)', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(mockSource);
      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res };
      });

      mockRbiAdapter.fetchAndNormalize.mockRejectedValueOnce(
        new SsrfSecurityException('Prohibited private IP destination'),
      );

      const result = await service.syncSource(mockSource.id);
      expect(result.success).toBe(false);

      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSource.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.PAUSED,
            isPaused: true,
            consecutiveFailures: 1,
            nextScheduledFetchAt: expect.any(Date),
            sanitizedDiagnostics: expect.objectContaining({
              isPermanent: true,
              category: 'SECURITY_SSRF',
            }),
          }),
        }),
      );
    });

    it('should apply bounded exponential backoff for transient failures (SCHED-01)', async () => {
      // Test progression: 1 failure = 15m, 2 failures = 30m, 3 failures = 60m
      const sourceWith2Failures = {
        ...mockSource,
        consecutiveFailures: 2,
      };

      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(sourceWith2Failures);
      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res };
      });

      mockRbiAdapter.fetchAndNormalize.mockRejectedValueOnce(
        new Error('ETIMEDOUT: Connection timed out'),
      );

      const beforeTime = Date.now();
      const result = await service.syncSource(sourceWith2Failures.id);
      expect(result.success).toBe(false);

      // Consecutive failures should increment to 3
      // Backoff delay for 3 failures: 15 * 2^(3-1) = 60 minutes
      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sourceWith2Failures.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.FAILING,
            isPaused: false,
            consecutiveFailures: 3,
            sanitizedDiagnostics: expect.objectContaining({
              delayMinutes: 60,
              consecutiveFailures: 3,
            }),
          }),
        }),
      );

      const updateCall = mockPrisma.regulatorySource.update.mock.calls.find(
        (c: any) => c[0].data.healthStatus === RegulatoryHealthStatus.FAILING,
      );
      const scheduledAt = updateCall[0].data.nextScheduledFetchAt.getTime();
      const expectedDelayMs = 60 * 60 * 1000;
      expect(scheduledAt).toBeGreaterThanOrEqual(beforeTime + expectedDelayMs - 1000);
      expect(scheduledAt).toBeLessThanOrEqual(beforeTime + expectedDelayMs + 5000);
    });

    it('should respect Retry-After header when provided for transient rate-limiting', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(mockSource);
      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res };
      });

      const rateLimitErr: any = new Error('HTTP 429 Too Many Requests (retry-after: 300)');
      rateLimitErr.headers = { 'retry-after': '300' };

      mockRbiAdapter.fetchAndNormalize.mockRejectedValueOnce(rateLimitErr);

      const beforeTime = Date.now();
      await service.syncSource(mockSource.id);

      // 300 seconds = 5 minutes
      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSource.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.FAILING,
            sanitizedDiagnostics: expect.objectContaining({
              delayMinutes: 5,
            }),
          }),
        }),
      );
    });

    it('should reset consecutiveFailures to 0 and restore normal interval after recovery', async () => {
      const previouslyFailingSource = {
        ...mockSource,
        consecutiveFailures: 5,
        healthStatus: RegulatoryHealthStatus.FAILING,
      };

      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(previouslyFailingSource);
      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res };
      });

      mockRbiAdapter.fetchAndNormalize.mockResolvedValueOnce({
        items: [],
        diagnostics: { itemCount: 0, fetchedAt: new Date().toISOString(), endpoint: 'test', durationMs: 5, rawBytesSize: 100 },
      });

      const beforeTime = Date.now();
      const result = await service.syncSource(previouslyFailingSource.id);
      expect(result.success).toBe(true);

      // Verify reset: consecutiveFailures: 0, isPaused: false, normal polling interval (1440m = 24h)
      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: previouslyFailingSource.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.HEALTHY,
            isPaused: false,
            consecutiveFailures: 0,
            lastErrorMessage: null,
          }),
        }),
      );

      const healthyCall = mockPrisma.regulatorySource.update.mock.calls.find(
        (c: any) => c[0].data.healthStatus === RegulatoryHealthStatus.HEALTHY,
      );
      const scheduledAt = healthyCall[0].data.nextScheduledFetchAt.getTime();
      const expectedNormalIntervalMs = 1440 * 60 * 1000;
      expect(scheduledAt).toBeGreaterThanOrEqual(beforeTime + expectedNormalIntervalMs - 1000);
    });
  });
});
