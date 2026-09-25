import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisQueueService } from './analysis-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { DocumentExtractionService } from './document-extraction.service';
import { AiRouterService } from '../controls/ai/ai-router.service';
import { ServiceUnavailableException } from '@nestjs/common';
import * as bullmq from 'bullmq';

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
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogsService, useValue: {} },
        { provide: FrameworkEntitlementsService, useValue: {} },
        { provide: DocumentExtractionService, useValue: {} },
        { provide: AiRouterService, useValue: {} },
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
});
