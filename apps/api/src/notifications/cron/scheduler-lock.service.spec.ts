import { SchedulerLockService, SCHEDULER_LOCKS } from './scheduler-lock.service';

describe('SchedulerLockService (PostgreSQL Cluster Coordination)', () => {
  let service: SchedulerLockService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(),
    };
    service = new SchedulerLockService(mockPrisma);
  });

  it('should acquire lock and execute task when lock is available', async () => {
    const mockTask = jest.fn().mockResolvedValue('task-output-ok');

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      };
      return callback(mockTx);
    });

    const res = await service.withLock(
      SCHEDULER_LOCKS.WEEKLY_DIGEST,
      'Weekly Executive Digest',
      mockTask,
    );

    expect(res.executed).toBe(true);
    expect(res.result).toBe('task-output-ok');
    expect(res.reason).toBe('LOCK_ACQUIRED');
    expect(mockTask).toHaveBeenCalledTimes(1);
  });

  it('should skip task and return executed:false when lock is held by another replica', async () => {
    const mockTask = jest.fn().mockResolvedValue('task-output-ok');

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
      };
      return callback(mockTx);
    });

    const res = await service.withLock(
      SCHEDULER_LOCKS.WEEKLY_DIGEST,
      'Weekly Executive Digest',
      mockTask,
    );

    expect(res.executed).toBe(false);
    expect(res.result).toBeUndefined();
    expect(res.reason).toBe('LOCK_UNAVAILABLE_SKIPPED');
    expect(mockTask).not.toHaveBeenCalled();
  });

  it('should rethrow error and automatically release transaction when task throws', async () => {
    const failingTask = jest.fn().mockRejectedValue(new Error('Database connectivity lost'));

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      };
      return callback(mockTx);
    });

    await expect(
      service.withLock(SCHEDULER_LOCKS.RISK_ESCALATION, 'Risk Escalation', failingTask),
    ).rejects.toThrow('Database connectivity lost');

    expect(failingTask).toHaveBeenCalledTimes(1);
  });

  it('should execute distinct cluster jobs independently with their specific lock IDs', async () => {
    const task1 = jest.fn().mockResolvedValue('job-1');
    const task2 = jest.fn().mockResolvedValue('job-2');

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      };
      return callback(mockTx);
    });

    const res1 = await service.withLock(SCHEDULER_LOCKS.DUE_DATE_REMINDER, 'Due Date Reminders', task1);
    const res2 = await service.withLock(SCHEDULER_LOCKS.RISK_ESCALATION, 'Risk Escalation', task2);

    expect(res1.executed).toBe(true);
    expect(res2.executed).toBe(true);
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).toHaveBeenCalledTimes(1);
  });

  it('should bypass safely when $transaction is not provided (mock test fallback)', async () => {
    const minimalService = new SchedulerLockService({} as any);
    const fallbackTask = jest.fn().mockResolvedValue('fallback-success');

    const res = await minimalService.withLock(
      SCHEDULER_LOCKS.WEEKLY_DIGEST,
      'Weekly Executive Digest',
      fallbackTask,
    );

    expect(res.executed).toBe(true);
    expect(res.result).toBe('fallback-success');
    expect(res.reason).toBe('BYPASS_NO_DB');
    expect(fallbackTask).toHaveBeenCalledTimes(1);
  });

  it('should keep transaction open for entire duration of task execution and pass tx to task', async () => {
    let transactionCompleted = false;
    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      dummyQuery: jest.fn().mockResolvedValue(true),
    };

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      const result = await callback(mockTx);
      transactionCompleted = true;
      return result;
    });

    const asyncTask = jest.fn().mockImplementation(async (tx: any) => {
      expect(tx).toBe(mockTx);
      // Verify transaction is still active while task is running
      expect(transactionCompleted).toBe(false);
      await tx.dummyQuery();
      return 'done';
    });

    const res = await service.withLock(
      SCHEDULER_LOCKS.WEEKLY_DIGEST,
      'Weekly Executive Digest',
      asyncTask,
    );

    expect(res.executed).toBe(true);
    expect(transactionCompleted).toBe(true);
    expect(mockTx.dummyQuery).toHaveBeenCalledTimes(1);
  });

  it('should simulate concurrent replica contention: replica 1 acquires lock, replica 2 skips', async () => {
    let lockHeld = false;

    // Simulate PostgreSQL cluster behavior
    const createReplica = () => {
      const replicaPrisma = {
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          const replicaTx = {
            $queryRaw: jest.fn().mockImplementation(async () => {
              if (lockHeld) {
                return [{ acquired: false }];
              }
              lockHeld = true;
              return [{ acquired: true }];
            }),
          };
          try {
            return await callback(replicaTx);
          } finally {
            lockHeld = false;
          }
        }),
      };
      return new SchedulerLockService(replicaPrisma as any);
    };

    const replica1 = createReplica();
    const replica2 = createReplica();

    let replica1Finished = false;
    const longRunningTask = jest.fn().mockImplementation(async () => {
      // While replica 1 is running, replica 2 attempts lock acquisition
      const res2 = await replica2.withLock(
        SCHEDULER_LOCKS.DUE_DATE_REMINDER,
        'Due Date Reminders',
        jest.fn(),
      );
      expect(res2.executed).toBe(false);
      expect(res2.reason).toBe('LOCK_UNAVAILABLE_SKIPPED');
      replica1Finished = true;
      return 'replica-1-success';
    });

    const res1 = await replica1.withLock(
      SCHEDULER_LOCKS.DUE_DATE_REMINDER,
      'Due Date Reminders',
      longRunningTask,
    );

    expect(res1.executed).toBe(true);
    expect(res1.result).toBe('replica-1-success');
    expect(replica1Finished).toBe(true);
    expect(longRunningTask).toHaveBeenCalledTimes(1);
  });
});
