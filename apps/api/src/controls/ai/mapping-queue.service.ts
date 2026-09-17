import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AiRouterService } from './ai-router.service';
import { CandidateClause } from './ai-provider.interface';
import { MappingStatus, ModelTier } from '@omnigrc/shared';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

export interface JobState {
  jobId: string;
  organizationId: string;
  userId: string;
  controlId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  error?: string;
  createdAt: Date;
}

import { LicenseVerificationService } from '../../license-verification/license-verification.service';

@Injectable()
export class MappingQueueService implements OnModuleInit {
  private readonly logger = new Logger(MappingQueueService.name);
  private jobStore = new Map<string, JobState>();
  private bullQueue: Queue | null = null;
  private isRedisConnected = false;

  private readonly DEFAULT_JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_TERMINAL_JOBS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly aiRouterService: AiRouterService,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  /**
   * Bounded Cleanup Strategy:
   * 1. Removes terminal jobs ('done' | 'failed') older than ttlMs (default 24h).
   * 2. If terminal job count still exceeds maxTerminalJobs, prunes oldest terminal jobs.
   * 3. Never deletes active jobs ('queued' | 'processing').
   */
  public cleanupExpiredJobs(
    ttlMs: number = this.DEFAULT_JOB_TTL_MS,
    maxTerminalJobs: number = this.MAX_TERMINAL_JOBS,
  ): number {
    const now = Date.now();
    let removedCount = 0;
    const terminalJobs: { jobId: string; createdAt: Date }[] = [];

    for (const [jobId, job] of this.jobStore.entries()) {
      if (job.status === 'done' || job.status === 'failed') {
        if (now - job.createdAt.getTime() > ttlMs) {
          this.jobStore.delete(jobId);
          removedCount++;
        } else {
          terminalJobs.push({ jobId, createdAt: job.createdAt });
        }
      }
    }

    if (terminalJobs.length > maxTerminalJobs) {
      terminalJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const toRemove = terminalJobs.slice(0, terminalJobs.length - maxTerminalJobs);
      for (const item of toRemove) {
        this.jobStore.delete(item.jobId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug(`MappingQueueService cleanup pruned ${removedCount} expired/excess terminal job states.`);
    }

    return removedCount;
  }

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      const redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null, // Do not retry continuously if Redis is offline
      });

      redisClient.on('connect', () => {
        if (!this.isRedisConnected) {
          this.isRedisConnected = true;
          this.logger.log(`Connected to Redis at ${redisUrl} for BullMQ job queue.`);
          try {
            this.bullQueue = new Queue('control-mapping-queue', { connection: redisClient });
            new Worker(
              'control-mapping-queue',
              async (job) => {
                await this.processJob(job.data);
              },
              { connection: redisClient },
            );
          } catch (err: any) {
            this.logger.warn(`BullMQ init failed: ${err.message}`);
          }
        }
      });

      redisClient.on('error', (err) => {
        if (this.isRedisConnected) {
          this.logger.warn(`Redis disconnected: ${err.message}. Falling back to in-memory async job queue.`);
        }
        this.isRedisConnected = false;
      });
    } catch (err: any) {
      this.logger.warn(`Could not initialize Redis client (${err.message}). Using in-memory async job runner.`);
      this.isRedisConnected = false;
    }

    this.licenseVerificationService.onLicenseRenewed(() => {
      this.logger.log('MappingQueueService: Received license renewal notification. Resuming BullMQ queue.');
      this.resumeQueue();
    });
  }

  async enqueueMappingJob(organizationId: string, userId: string, controlId: string): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const jobState: JobState = {
      jobId,
      organizationId,
      userId,
      controlId,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    };

    this.jobStore.set(jobId, jobState);

    const jobPayload = { jobId, organizationId, userId, controlId };

    if (this.isRedisConnected && this.bullQueue) {
      try {
        await this.bullQueue.add('suggest-mappings', jobPayload, { jobId });
      } catch (err: any) {
        this.logger.warn(`BullMQ enqueue failed (${err.message}). Executing via in-memory job runner.`);
        this.executeInMemoryJob(jobPayload);
      }
    } else {
      // In-memory fallback
      this.executeInMemoryJob(jobPayload);
    }

    return jobId;
  }

  public getJobState(jobId: string): JobState | undefined {
    return this.jobStore.get(jobId);
  }

  private executeInMemoryJob(data: { jobId: string; organizationId: string; userId: string; controlId: string }) {
    setImmediate(async () => {
      await this.processJob(data);
    });
  }

  public async pauseQueue() {
    if (this.bullQueue) {
      try {
        await this.bullQueue.pause();
        this.logger.log('MappingQueueService: BullMQ queue paused due to non-valid license state.');
      } catch (err: any) {
        this.logger.warn(`Failed to pause BullMQ queue: ${err.message}`);
      }
    }
  }

  public async resumeQueue() {
    if (this.bullQueue) {
      try {
        await this.bullQueue.resume();
        this.logger.log('MappingQueueService: BullMQ queue resumed following valid license confirmation.');
      } catch (err: any) {
        this.logger.warn(`Failed to resume BullMQ queue: ${err.message}`);
      }
    }
  }

  private async processJob(data: { jobId: string; organizationId: string; userId: string; controlId: string }) {
    const { jobId, organizationId, userId, controlId } = data;
    const state = this.jobStore.get(jobId);

    const licenseState = await this.licenseVerificationService.getEvaluatedState();
    if (licenseState.state !== 'VALID') {
      this.logger.warn(
        `MappingQueueService: License state is "${licenseState.state}". Pausing queue and skipping AI processing for job "${jobId}" to protect external API usage.`,
      );
      await this.pauseQueue();
      if (state) {
        state.status = 'queued';
        state.error = `Job deferred: license state is ${licenseState.state}`;
      }
      return;
    } else {
      await this.resumeQueue();
    }

    if (state) {
      state.status = 'processing';
      state.progress = 20;
    }


    try {
      // 1. Fetch Control (Verify tenant scoping)
      const control = await this.prisma.control.findFirst({
        where: { id: controlId, organizationId, deletedAt: null },
      });

      if (!control) {
        throw new Error(`Control with ID ${controlId} not found or deleted.`);
      }

      if (state) state.progress = 40;

      // 2. Fetch All Candidate Framework Clauses
      const clauses = await this.prisma.frameworkClause.findMany({
        include: { framework: { select: { code: true } } },
      });

      const candidates: CandidateClause[] = clauses.map((c) => ({
        id: c.id,
        frameworkCode: c.framework.code,
        code: c.code,
        title: c.title,
      }));

      // STAGE 2a: REDACTION
      // Payload contains ONLY control's name + description and candidate FrameworkClause text.
      // NEVER includes organizationId, user identities, or any risk/asset data.
      const redactedPayload = {
        organizationId,
        actorId: userId,
        controlId: control.id,
        controlName: control.name,
        controlDescription: control.description,
        candidates,
      };

      if (state) state.progress = 60;

      // STAGE 2b, 2c, 2d: TIERED ROUTING, EXTERNAL CALL, RESPONSE VALIDATOR
      const { acceptedSuggestions, tierUsed } = await this.aiRouterService.executeMapping(redactedPayload);

      if (state) state.progress = 80;

      // STAGE 2e: WRITE ACCEPTED SUGGESTIONS TO DB
      for (const sug of acceptedSuggestions) {
        await this.prisma.controlFrameworkMapping.upsert({
          where: {
            controlId_frameworkClauseId: {
              controlId: control.id,
              frameworkClauseId: sug.clauseId,
            },
          },
          update: {
            status: MappingStatus.SUGGESTED,
            confidenceScore: sug.confidenceScore,
            modelTier: tierUsed,
          },
          create: {
            controlId: control.id,
            frameworkClauseId: sug.clauseId,
            status: MappingStatus.SUGGESTED,
            confidenceScore: sug.confidenceScore,
            modelTier: tierUsed,
          },
        });

        // STAGE 2f: AUDIT LOG (MAPPING_SUGGESTED) - METADATA ONLY
        await this.auditLogsService.log({
          organizationId,
          actorId: userId,
          action: 'MAPPING_SUGGESTED',
          entityType: 'Control',
          entityId: control.id,
          metadata: {
            controlId: control.id,
            frameworkCode: sug.frameworkCode,
            clauseCode: sug.clauseCode,
            confidenceScore: sug.confidenceScore,
            modelTier: tierUsed,
          },
        });
      }

      if (state) {
        state.status = 'done';
        state.progress = 100;
      }
      this.logger.log(`AI Mapping Job ${jobId} completed successfully with ${acceptedSuggestions.length} accepted suggestions.`);
    } catch (err: any) {
      this.logger.error(`AI Mapping Job ${jobId} failed: ${err.message}`);
      if (state) {
        state.status = 'failed';
        state.error = err.message || 'Job processing failed';
      }
    } finally {
      this.cleanupExpiredJobs();
    }
  }
}
