import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisQueueService } from './analysis-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { DocumentExtractionService } from './document-extraction.service';
import { AiRouterService } from '../controls/ai/ai-router.service';
import { ServiceUnavailableException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ExtractionStatus, AnalysisStatus } from '@omnigrc/shared';
import * as bullmq from 'bullmq';

import { EffectiveServiceStateResolver } from '../service-control/effective-service-state-resolver.service';

jest.mock('bullmq', () => {
  const original = jest.requireActual('bullmq');
  return {
    ...original,
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue('job_123'),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('AnalysisQueueService Lifecycle & Worker Leak Prevention', () => {
  let queueService: AnalysisQueueService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisQueueService,
        {
          provide: PrismaService,
          useValue: {
            organizationControlStateProjection: { findUnique: jest.fn() },
            documentAnalysis: { findFirst: jest.fn(), update: jest.fn() },
            analysisRun: { create: jest.fn(), update: jest.fn() },
            extractedFinding: { deleteMany: jest.fn() },
          },
        },
        { provide: AuditLogsService, useValue: {} },
        { provide: FrameworkEntitlementsService, useValue: {} },
        { provide: DocumentExtractionService, useValue: { extract: jest.fn() } },
        { provide: AiRouterService, useValue: {} },
        {
          provide: EffectiveServiceStateResolver,
          useValue: { resolveEffectiveState: jest.fn().mockResolvedValue({ isAvailable: true }) },
        },
      ],
    }).compile();

    queueService = module.get<AnalysisQueueService>(AnalysisQueueService);
  });

  afterEach(async () => {
    await queueService.onModuleDestroy();
  });

  it('should instantiate exactly ONE Worker and ONE Queue on module initialization', async () => {
    await queueService.onModuleInit();

    expect(bullmq.Queue).toHaveBeenCalledTimes(1);
    expect(bullmq.Worker).toHaveBeenCalledTimes(1);

    // Verify stalledInterval parameter passed to Worker options
    const workerCall = (bullmq.Worker as unknown as jest.Mock).mock.calls[0];
    expect(workerCall[0]).toBe('document-analysis-queue');
    expect(workerCall[2]).toMatchObject({ stalledInterval: 300000 });
  });

  it('should NOT create additional Workers or Queues when Redis emits error or connect events', async () => {
    await queueService.onModuleInit();

    expect(bullmq.Worker).toHaveBeenCalledTimes(1);

    // Retrieve internal redisClient and emit event simulations
    const redisClient = (queueService as any).redisClient;
    expect(redisClient).toBeDefined();

    // Simulate Redis disconnect / error
    redisClient.emit('error', new Error('ERR max requests limit exceeded'));
    expect(bullmq.Worker).toHaveBeenCalledTimes(1);
    expect(bullmq.Queue).toHaveBeenCalledTimes(1);

    // Simulate Redis reconnect
    redisClient.emit('connect');
    redisClient.emit('ready');
    expect(bullmq.Worker).toHaveBeenCalledTimes(1);
    expect(bullmq.Queue).toHaveBeenCalledTimes(1);
  });

  it('should properly close Worker, Queue, and Redis client on module destroy', async () => {
    await queueService.onModuleInit();

    const workerInstance = (queueService as any).worker;
    const queueInstance = (queueService as any).bullQueue;

    await queueService.onModuleDestroy();

    expect(workerInstance.close).toHaveBeenCalledTimes(1);
    expect(queueInstance.close).toHaveBeenCalledTimes(1);
    expect((queueService as any).worker).toBeNull();
    expect((queueService as any).bullQueue).toBeNull();
  });

  it('should throw ServiceUnavailableException in production if Redis is disconnected', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await expect(
        queueService.enqueueAnalysis('analysis-1', 'org-1', 'user-1', 'ev-1'),
      ).rejects.toThrow(ServiceUnavailableException);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should throw ServiceUnavailableException in production if bullQueue.add fails with Redis error', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await queueService.onModuleInit();
    const bullQueue = (queueService as any).bullQueue;
    bullQueue.add.mockRejectedValueOnce(new Error('ERR max requests limit exceeded'));

    try {
      await expect(
        queueService.enqueueAnalysis('analysis-1', 'org-1', 'user-1', 'ev-1'),
      ).rejects.toThrow(ServiceUnavailableException);
    } finally {
      process.env.NODE_ENV = originalEnv;
      await queueService.onModuleDestroy();
    }
  });

  it('should restore durable queue submissions when Redis reconnects after an outage', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await queueService.onModuleInit();
      const redisClient = (queueService as any).redisClient;

      // 1. Simulate Redis error/disconnect
      redisClient.emit('error', new Error('Connection refused'));
      redisClient.emit('close');
      expect((queueService as any).isRedisConnected).toBe(false);

      // Submission fails while disconnected
      await expect(
        queueService.enqueueAnalysis('analysis-1', 'org-1', 'user-1', 'ev-1'),
      ).rejects.toThrow(ServiceUnavailableException);

      // 2. Simulate Redis reconnect & ready
      redisClient.emit('connect');
      redisClient.emit('ready');
      expect((queueService as any).isRedisConnected).toBe(true);

      // Submission succeeds after reconnect
      const analysisId = await queueService.enqueueAnalysis('analysis-1', 'org-1', 'user-1', 'ev-1');
      expect(analysisId).toBe('analysis-1');
    } finally {
      process.env.NODE_ENV = originalEnv;
      await queueService.onModuleDestroy();
    }
  });

  it('should abort final persistence and record ERR_SERVICE_DISABLED if authorization is revoked mid-flight', async () => {
    const resolver = (queueService as any).effectiveServiceStateResolver;
    jest.spyOn(resolver, 'resolveEffectiveState')
      .mockResolvedValueOnce({ isAvailable: true } as any)
      .mockResolvedValueOnce({ isAvailable: false, reason: 'Service disabled mid-flight' } as any);

    const prisma = (queueService as any).prisma;
    jest.spyOn(prisma.organizationControlStateProjection, 'findUnique').mockResolvedValueOnce(null);
    jest.spyOn(prisma.documentAnalysis, 'findFirst').mockResolvedValueOnce({
      id: 'analysis-1',
      organizationId: 'org-1',
      evidenceFileName: 'doc.pdf',
    } as any);
    jest.spyOn(prisma.analysisRun, 'create').mockResolvedValueOnce({ id: 'run-1' } as any);

    const extractionService = (queueService as any).extractionService;
    jest.spyOn(extractionService, 'extract').mockResolvedValueOnce({
      extractionStatus: 'SUCCESS',
      fullText: 'Document contents',
      sections: [],
    } as any);

    await (queueService as any).processJob({ analysisId: 'analysis-1', organizationId: 'org-1' });

    expect(prisma.documentAnalysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('ERR_SERVICE_DISABLED'),
        }),
      }),
    );
    expect(prisma.extractedFinding.deleteMany).not.toHaveBeenCalled();
  });

  describe('Document Extraction Failure Propagation & Status Persistence Regression', () => {
    it('should persist FAILED and non-SUCCESS extractionStatus when extract() returns an explicit failure status', async () => {
      const resolver = (queueService as any).effectiveServiceStateResolver;
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({ isAvailable: true } as any);

      const prisma = (queueService as any).prisma;
      jest.spyOn(prisma.organizationControlStateProjection, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.documentAnalysis, 'findFirst').mockResolvedValue({
        id: 'analysis-fail-1',
        organizationId: 'org-1',
        evidenceFileName: 'scanned.png',
      } as any);
      jest.spyOn(prisma.analysisRun, 'create').mockResolvedValue({ id: 'run-fail-1' } as any);

      const generateFindingsSpy = jest.spyOn(queueService as any, 'generateDocumentFindings');

      const extractionService = (queueService as any).extractionService;
      jest.spyOn(extractionService, 'extract').mockResolvedValueOnce({
        extractionStatus: ExtractionStatus.OCR_UNAVAILABLE,
        fullText: '',
        sections: [],
      } as any);

      await (queueService as any).processJob({ analysisId: 'analysis-fail-1', organizationId: 'org-1' });

      // Confirm DocumentAnalysis updated to FAILED with exact extractionStatus
      expect(prisma.documentAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-fail-1' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
            extractionStatus: ExtractionStatus.OCR_UNAVAILABLE,
          }),
        }),
      );

      // Confirm AnalysisRun updated to FAILED
      expect(prisma.analysisRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-fail-1' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
          }),
        }),
      );

      // Confirm generateDocumentFindings() was NEVER called
      expect(generateFindingsSpy).not.toHaveBeenCalled();
    });

    it('should persist FAILED with EMPTY_DOCUMENT when extract() throws NotFoundException for a missing file', async () => {
      const resolver = (queueService as any).effectiveServiceStateResolver;
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({ isAvailable: true } as any);

      const prisma = (queueService as any).prisma;
      jest.spyOn(prisma.organizationControlStateProjection, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.documentAnalysis, 'findFirst').mockResolvedValue({
        id: 'analysis-missing-1',
        organizationId: 'org-1',
        evidenceFileName: 'missing.pdf',
      } as any);
      jest.spyOn(prisma.analysisRun, 'create').mockResolvedValue({ id: 'run-missing-1' } as any);

      const generateFindingsSpy = jest.spyOn(queueService as any, 'generateDocumentFindings');

      const extractionService = (queueService as any).extractionService;
      jest.spyOn(extractionService, 'extract').mockRejectedValueOnce(
        new NotFoundException('Document file not found on storage disk.'),
      );

      await (queueService as any).processJob({ analysisId: 'analysis-missing-1', organizationId: 'org-1' });

      // Confirm DocumentAnalysis was NOT left with extractionStatus = SUCCESS
      expect(prisma.documentAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-missing-1' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
            extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
            errorMessage: 'Document file not found on storage disk.',
          }),
        }),
      );

      expect(prisma.analysisRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-missing-1' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
          }),
        }),
      );

      expect(generateFindingsSpy).not.toHaveBeenCalled();
    });

    it('should persist FAILED with MALFORMED_DOCUMENT when extract() throws BadRequestException for traversal', async () => {
      const resolver = (queueService as any).effectiveServiceStateResolver;
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({ isAvailable: true } as any);

      const prisma = (queueService as any).prisma;
      jest.spyOn(prisma.organizationControlStateProjection, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.documentAnalysis, 'findFirst').mockResolvedValue({
        id: 'analysis-traversal-1',
        organizationId: 'org-1',
        evidenceFileName: 'bad.pdf',
      } as any);
      jest.spyOn(prisma.analysisRun, 'create').mockResolvedValue({ id: 'run-traversal-1' } as any);

      const generateFindingsSpy = jest.spyOn(queueService as any, 'generateDocumentFindings');

      const extractionService = (queueService as any).extractionService;
      jest.spyOn(extractionService, 'extract').mockRejectedValueOnce(
        new BadRequestException('Path traversal detected: target escapes storage root.'),
      );

      await (queueService as any).processJob({ analysisId: 'analysis-traversal-1', organizationId: 'org-1' });

      expect(prisma.documentAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-traversal-1' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
            extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
            errorMessage: 'Path traversal detected: target escapes storage root.',
          }),
        }),
      );

      expect(generateFindingsSpy).not.toHaveBeenCalled();
    });
  });
});
