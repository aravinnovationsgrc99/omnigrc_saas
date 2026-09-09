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

@Injectable()
export class MappingQueueService implements OnModuleInit {
  private readonly logger = new Logger(MappingQueueService.name);
  private jobStore = new Map<string, JobState>();
  private bullQueue: Queue | null = null;
  private isRedisConnected = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly aiRouterService: AiRouterService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      const redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null, // Do not retry continuously if Redis is offline
      });

      redisClient.on('connect', () => {
        this.isRedisConnected = true;
        this.logger.log(`Connected to Redis at ${redisUrl} for BullMQ job queue.`);
      });

      redisClient.on('error', (err) => {
        if (this.isRedisConnected) {
          this.logger.warn(`Redis disconnected: ${err.message}. Falling back to in-memory async job queue.`);
        }
        this.isRedisConnected = false;
      });

      this.bullQueue = new Queue('control-mapping-queue', { connection: redisClient });

      new Worker(
        'control-mapping-queue',
        async (job) => {
          await this.processJob(job.data);
        },
        { connection: redisClient }
      );
    } catch (err: any) {
      this.logger.warn(`Could not initialize Redis BullMQ client (${err.message}). Using in-memory async job runner.`);
      this.isRedisConnected = false;
    }
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

  private async processJob(data: { jobId: string; organizationId: string; userId: string; controlId: string }) {
    const { jobId, organizationId, userId, controlId } = data;
    const state = this.jobStore.get(jobId);
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
    }
  }
}
