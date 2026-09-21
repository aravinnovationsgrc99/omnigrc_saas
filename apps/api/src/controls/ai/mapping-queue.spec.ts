import { Test, TestingModule } from '@nestjs/testing';
import { MappingQueueService, JobState } from './mapping-queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AiRouterService } from './ai-router.service';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { FrameworkEntitlementsService } from '../../frameworks/framework-entitlements.service';

describe('MappingQueueService Bounded Memory Cleanup', () => {
  let queueService: MappingQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MappingQueueService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogsService, useValue: {} },
        { provide: AiRouterService, useValue: {} },
        {
          provide: LicenseVerificationService,
          useValue: {
            getEvaluatedState: jest.fn().mockResolvedValue({ state: 'VALID' }),
            onLicenseRenewed: jest.fn(),
          },
        },
        {
          provide: FrameworkEntitlementsService,
          useValue: {
            getEntitledFrameworkIds: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    queueService = module.get<MappingQueueService>(MappingQueueService);
  });

  it('should retain active jobs (queued / processing) during cleanup', async () => {
    const activeJobId = await queueService.enqueueMappingJob('org-1', 'user-1', 'ctrl-1');
    const activeJob = queueService.getJobState(activeJobId);
    expect(activeJob).toBeDefined();
    expect(activeJob?.status).toBe('queued');

    // Run cleanup with TTL 0ms
    queueService.cleanupExpiredJobs(0, 100);

    // Active queued job must NOT be pruned
    expect(queueService.getJobState(activeJobId)).toBeDefined();
  });

  it('should retain recently completed job state (under TTL)', async () => {
    const jobId = await queueService.enqueueMappingJob('org-1', 'user-1', 'ctrl-1');
    const jobState = queueService.getJobState(jobId);
    if (jobState) {
      jobState.status = 'done';
      jobState.progress = 100;
    }

    // Cleanup with default 24h TTL
    queueService.cleanupExpiredJobs(24 * 60 * 60 * 1000, 1000);

    // Recently completed job remains available
    expect(queueService.getJobState(jobId)).toBeDefined();
    expect(queueService.getJobState(jobId)?.status).toBe('done');
  });

  it('should remove expired terminal state (older than TTL)', async () => {
    const jobId = await queueService.enqueueMappingJob('org-1', 'user-1', 'ctrl-1');
    const jobState = queueService.getJobState(jobId);
    if (jobState) {
      jobState.status = 'done';
      // Set createdAt to 25 hours ago
      jobState.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    }

    // Run cleanup with 24h TTL
    const removedCount = queueService.cleanupExpiredJobs(24 * 60 * 60 * 1000, 1000);

    expect(removedCount).toBe(1);
    expect(queueService.getJobState(jobId)).toBeUndefined();
  });

  it('should bound terminal job memory by maxTerminalJobs limit', async () => {
    // Create 15 completed jobs
    const jobIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      const jobId = await queueService.enqueueMappingJob('org-1', 'user-1', `ctrl-${i}`);
      const jobState = queueService.getJobState(jobId);
      if (jobState) {
        jobState.status = 'done';
        jobState.createdAt = new Date(Date.now() - (15 - i) * 1000); // STAGGERED DATES
      }
      jobIds.push(jobId);
    }

    // Run cleanup with maxTerminalJobs = 5 (and long TTL)
    const removedCount = queueService.cleanupExpiredJobs(24 * 60 * 60 * 1000, 5);

    // 10 oldest completed jobs should be removed, leaving 5 newest
    expect(removedCount).toBe(10);

    // Oldest job removed
    expect(queueService.getJobState(jobIds[0])).toBeUndefined();
    // Newest job kept
    expect(queueService.getJobState(jobIds[14])).toBeDefined();
  });

  it('should initialize onModuleInit cleanly without throwing maxRetriesPerRequest BullMQ error', async () => {
    await expect(queueService.onModuleInit()).resolves.not.toThrow();
  });
});
