import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, JobType, JobStatus } from 'prisma-db';
import { WorkerService } from '../WorkerService';
import { calculateRetryDelay } from '../utils/retry';

describe('Worker Tests', () => {
  let queueId: string;

  beforeAll(async () => {
    // Clean DB
    await prisma.jobExecution.deleteMany();
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: 'worker_test@example.com', passwordHash: 'hash', name: 'Test' }
    });
    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    const project = await prisma.project.create({
      data: { name: 'Test Project', organizationId: org.id, createdById: user.id },
    });
    const queue = await prisma.queue.create({
      data: { name: 'Test Queue', projectId: project.id, concurrencyLimit: 100 },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('calculateRetryDelay should compute correct delays', () => {
    expect(calculateRetryDelay('FIXED', 1, 30, 2, 3600)).toBe(30);
    expect(calculateRetryDelay('FIXED', 5, 30, 2, 3600)).toBe(30);

    expect(calculateRetryDelay('LINEAR', 1, 30, 2, 3600)).toBe(30);
    expect(calculateRetryDelay('LINEAR', 3, 30, 2, 3600)).toBe(90);

    expect(calculateRetryDelay('EXPONENTIAL', 1, 30, 2, 3600)).toBe(30); // 30 * 2^0
    expect(calculateRetryDelay('EXPONENTIAL', 2, 30, 2, 3600)).toBe(60); // 30 * 2^1
    expect(calculateRetryDelay('EXPONENTIAL', 4, 30, 2, 3600)).toBe(240); // 30 * 2^3

    // Max cap test
    expect(calculateRetryDelay('EXPONENTIAL', 10, 30, 2, 3600)).toBe(3600);
  });

  it('should support concurrent claim correctness', async () => {
    // 1. Seed 10 jobs
    const numJobs = 10;
    const jobData = Array.from({ length: numJobs }).map((_, i) => ({
      queueId,
      type: JobType.IMMEDIATE,
      status: JobStatus.QUEUED,
      payload: { index: i },
    }));

    await prisma.job.createMany({ data: jobData });

    // 2. Create 10 workers in DB and use their IDs
    const numWorkers = 10;
    const workerRecords = await Promise.all(
      Array.from({ length: numWorkers }).map((_, i) => 
        prisma.worker.create({
          data: { hostname: `test-worker-${i}`, concurrency: 1, status: 'ONLINE' }
        })
      )
    );

    const workers = workerRecords.map((record) => {
      const w = new WorkerService(1);
      (w as any).workerId = record.id;
      return w;
    });

    // 3. Race them simultaneously! Each tries to claim one job exactly at the same time.
    const claims = await Promise.all(
      workers.map((w) => (w as any).claimJob(queueId))
    );

    // 4. Assert correctness
    const claimedJobs = claims.filter(job => job !== null);
    
    // Every claim should have succeeded because there were 10 jobs and 10 workers,
    // but what matters most is they all claimed a DIFFERENT job (no duplicates).
    const claimedJobIds = new Set(claimedJobs.map(j => j.id));

    expect(claimedJobs.length).toBe(claimedJobIds.size); // No duplicate claims!
    expect(claimedJobs.length).toBe(numJobs); // All jobs were claimed

    // Verify DB state
    const remainingQueued = await prisma.job.count({ where: { queueId, status: JobStatus.QUEUED } });
    expect(remainingQueued).toBe(0);
    
    const nowClaimed = await prisma.job.count({ where: { queueId, status: JobStatus.CLAIMED } });
    expect(nowClaimed).toBe(numJobs);
  });
});
