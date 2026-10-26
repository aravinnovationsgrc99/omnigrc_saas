import { RegulatoryIngestionService } from './regulatory-ingestion.service';
import { RbiSourceAdapter } from './adapters/rbi-source.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SchedulerLockService } from '../notifications/cron/scheduler-lock.service';
import { RegulatorySourceType, RegulatoryHealthStatus, RegulatoryPublicationState } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('RegulatoryIngestionService (Deduplication, Versioning & Ingestion)', () => {
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

  describe('1. Adapter Resolution & Validation', () => {
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

  describe('2. Deduplication & Idempotent Publication Ingestion', () => {
    it('should create a new publication and version 1 when discovered for the first time', async () => {
      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce(null); // No existing by externalId
      mockPrisma.regulatoryPublication.create.mockResolvedValueOnce({
        id: 'pub-new-1',
        title: 'New Circular',
        currentVersionNumber: 1,
      });

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Delegation of Powers under FEMA',
        publicationNumber: 'RBI/2026/1',
        publicationDate: new Date('2026-10-23'),
        contentHash: 'hash-abc-123',
        rawContent: 'Sample HTML content',
      });

      expect(result.status).toBe('CREATED_NEW');
      expect(result.publicationId).toBe('pub-new-1');

      expect(mockPrisma.regulatoryPublication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceId: mockSource.id,
          catalogueEntryId: mockSource.catalogueEntryId,
          externalId: '13745',
          canonicalUrl: 'https://www.rbi.org.in/item/13745',
          contentHash: 'hash-abc-123',
          currentVersionNumber: 1,
          processingState: RegulatoryPublicationState.DISCOVERED,
          versions: {
            create: expect.objectContaining({
              versionNumber: 1,
              contentSha256: 'hash-abc-123',
              reasonForVersion: 'INITIAL_INGESTION',
            }),
          },
        }),
      });
    });

    it('should be idempotent and NOT create a new version when content hash is unchanged', async () => {
      // Existing publication with identical hash
      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce({
        id: 'pub-existing-1',
        contentHash: 'hash-identical-123',
        currentVersionNumber: 1,
        publicationNumber: 'RBI/2026/1',
      });

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Delegation of Powers under FEMA',
        publicationNumber: 'RBI/2026/1',
        contentHash: 'hash-identical-123',
      });

      expect(result.status).toBe('UNCHANGED');
      expect(result.publicationId).toBe('pub-existing-1');

      // Verify no new version was created
      expect(mockPrisma.regulatoryPublicationVersion.create).not.toHaveBeenCalled();
      // Verify lastObservedAt was updated
      expect(mockPrisma.regulatoryPublication.update).toHaveBeenCalledWith({
        where: { id: 'pub-existing-1' },
        data: expect.objectContaining({
          lastObservedAt: expect.any(Date),
        }),
      });
    });

    it('should create a new immutable version and increment version number when content changes', async () => {
      // Existing publication with old content hash
      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce({
        id: 'pub-existing-1',
        contentHash: 'hash-old-version-1',
        currentVersionNumber: 1,
        publicationNumber: 'RBI/2026/1',
      });

      const result = await service.processPublicationItem(mockSource as any, {
        externalId: '13745',
        canonicalUrl: 'https://www.rbi.org.in/item/13745',
        title: 'Delegation of Powers under FEMA (Amended)',
        publicationNumber: 'RBI/2026/1-Rev',
        contentHash: 'hash-new-version-2',
        rawContent: 'Updated amendment content',
      });

      expect(result.status).toBe('CREATED_VERSION');
      expect(result.publicationId).toBe('pub-existing-1');

      // Verify previous version is marked superseded
      expect(mockPrisma.regulatoryPublicationVersion.updateMany).toHaveBeenCalledWith({
        where: {
          publicationId: 'pub-existing-1',
          supersededAt: null,
        },
        data: {
          supersededAt: expect.any(Date),
        },
      });

      // Verify new version #2 is created
      expect(mockPrisma.regulatoryPublicationVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          publicationId: 'pub-existing-1',
          versionNumber: 2,
          contentSha256: 'hash-new-version-2',
          reasonForVersion: 'CONTENT_UPDATE_DETECTED',
        }),
      });

      // Verify publication record currentVersionNumber is updated to 2
      expect(mockPrisma.regulatoryPublication.update).toHaveBeenCalledWith({
        where: { id: 'pub-existing-1' },
        data: expect.objectContaining({
          currentVersionNumber: 2,
          contentHash: 'hash-new-version-2',
        }),
      });
    });

    it('should deduplicate by canonicalUrl when externalId is absent', async () => {
      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce({
        id: 'pub-url-dedup',
        contentHash: 'hash-url-same',
        currentVersionNumber: 1,
      });

      const result = await service.processPublicationItem(mockSource as any, {
        canonicalUrl: 'https://www.rbi.org.in/scripts/Directions.aspx?docId=555',
        title: 'Directions without External ID',
        contentHash: 'hash-url-same',
      });

      expect(result.status).toBe('UNCHANGED');
      expect(result.publicationId).toBe('pub-url-dedup');
    });
  });

  describe('3. Concurrency Lock & Source Sync Execution', () => {
    it('should acquire scheduler lock and execute sync when lock is available', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(mockSource);
      mockRbiAdapter.fetchAndNormalize.mockResolvedValueOnce({
        items: [
          {
            externalId: '100',
            canonicalUrl: 'https://www.rbi.org.in/item/100',
            title: 'Circular 100',
            contentHash: 'hash-100',
          },
        ],
        diagnostics: {
          itemCount: 1,
          fetchedAt: new Date().toISOString(),
          endpoint: mockSource.configuredEndpoint,
          durationMs: 45,
          rawBytesSize: 1024,
        },
      });

      mockPrisma.regulatoryPublication.findFirst.mockResolvedValueOnce(null);
      mockPrisma.regulatoryPublication.create.mockResolvedValueOnce({ id: 'pub-100' });

      // Mock lock acquisition success
      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res, reason: 'LOCK_ACQUIRED' };
      });

      const syncResult = await service.syncSource(mockSource.id, {
        actorId: 'admin-1',
        organizationId: 'org-test',
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.totalDiscovered).toBe(1);
      expect(syncResult.newPublicationsCount).toBe(1);

      // Verify health status updated to HEALTHY
      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSource.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.HEALTHY,
          }),
        }),
      );

      // Verify audit log emitted
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-test',
          actorId: 'admin-1',
          action: 'REGULATORY_SOURCE_SYNC',
        }),
      );
    });

    it('should gracefully skip duplicate execution when another replica holds the lock', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(mockSource);

      // Mock lock unavailable
      mockLockService.withLock.mockResolvedValueOnce({
        executed: false,
        reason: 'LOCK_UNAVAILABLE_SKIPPED',
      });

      const syncResult = await service.syncSource(mockSource.id);

      expect(syncResult.success).toBe(false);
      expect(syncResult.errorMessage).toContain('already in progress on another cluster worker');
      expect(mockRbiAdapter.fetchAndNormalize).not.toHaveBeenCalled();
    });

    it('should isolate failures and mark source FAILING without crashing the process', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce(mockSource);

      mockLockService.withLock.mockImplementation(async (lockId, jobName, task) => {
        const res = await task();
        return { executed: true, result: res };
      });

      mockRbiAdapter.fetchAndNormalize.mockRejectedValueOnce(
        new Error('Connection timeout to official regulator server'),
      );

      const syncResult = await service.syncSource(mockSource.id);

      expect(syncResult.success).toBe(false);
      expect(syncResult.errorMessage).toContain('Connection timeout');

      // Verify source updated with FAILING status and sanitized message
      expect(mockPrisma.regulatorySource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSource.id },
          data: expect.objectContaining({
            healthStatus: RegulatoryHealthStatus.FAILING,
            lastErrorMessage: expect.stringContaining('Connection timeout'),
          }),
        }),
      );
    });
  });
});
