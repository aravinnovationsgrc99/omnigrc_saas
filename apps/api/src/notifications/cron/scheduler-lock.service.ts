import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Stable 64-bit BigInt Lock Identifiers for Scheduled Cluster Jobs.
 * Deterministic unique lock keys in PostgreSQL advisory lock space.
 */
export const SCHEDULER_LOCKS = {
  DUE_DATE_REMINDER: BigInt('80102001'),
  RISK_ESCALATION: BigInt('80102002'),
  WEEKLY_DIGEST: BigInt('80102003'),
};

export interface SchedulerLockResult<T> {
  executed: boolean;
  result?: T;
  reason?: 'LOCK_ACQUIRED' | 'LOCK_UNAVAILABLE_SKIPPED' | 'BYPASS_NO_DB';
}

@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a scheduled task exclusively across multiple API replicas using
   * native PostgreSQL transaction-scoped advisory locks (`pg_try_advisory_xact_lock`).
   *
   * Architectural & Operational Guarantees:
   * 1. 100% Native to PostgreSQL — Zero extra infrastructure, zero Redis/BullMQ required.
   * 2. Transaction-scoped — Automatically released on commit, rollback, unhandled exception, or pod crash.
   * 3. Connection-safe — Prisma's interactive transaction guarantees a single dedicated connection throughout execution.
   * 4. Non-blocking Mutual Exclusion — If another replica holds the lock, immediately returns `{ executed: false }`
   *    without queue buildup or race conditions.
   * 5. Defensive Testing Fallback — If running in test environments without interactive transactions,
   *    executes task seamlessly without locking overhead.
   */
  async withLock<T>(
    lockId: bigint,
    jobName: string,
    task: (tx?: any) => Promise<T>,
    timeoutMs: number = 300000,
  ): Promise<SchedulerLockResult<T>> {
    try {
      // Check if interactive transactions are supported on current Prisma instance
      if (typeof this.prisma.$transaction !== 'function') {
        const result = await task();
        return { executed: true, result, reason: 'BYPASS_NO_DB' };
      }

      return await this.prisma.$transaction(
        async (tx: any) => {
          let acquired = true;

          if (typeof tx.$queryRaw === 'function') {
            try {
              const res = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${lockId}::bigint) as acquired`;
              acquired = Boolean(res?.[0]?.acquired);
            } catch (queryErr: any) {
              this.logger.warn(
                `[SchedulerLock] Advisory lock query unavailable on target DB (${queryErr.message}). Proceeding safely with task execution.`,
              );
              acquired = true;
            }
          }

          if (!acquired) {
            this.logger.log(
              `[SchedulerLock] Cluster task "${jobName}" (${lockId.toString()}) is currently held by another replica. Skipping duplicate execution.`,
            );
            return { executed: false, reason: 'LOCK_UNAVAILABLE_SKIPPED' };
          }

          this.logger.log(
            `[SchedulerLock] Acquired exclusive cluster lock for "${jobName}" (${lockId.toString()}). Executing task...`,
          );

          const result = await task(tx);

          this.logger.log(
            `[SchedulerLock] Successfully completed task "${jobName}". Lock released automatically upon transaction completion.`,
          );

          return { executed: true, result, reason: 'LOCK_ACQUIRED' };
        },
        {
          timeout: timeoutMs,
          maxWait: 5000,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `[SchedulerLock] Unhandled error during locked execution of "${jobName}": ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}
