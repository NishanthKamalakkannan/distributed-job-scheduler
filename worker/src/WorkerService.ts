import { prisma, Job, WorkerStatus } from 'prisma-db';
import pino from 'pino';
import { executeJob } from './JobExecutor';
import os from 'os';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class WorkerService {
  private workerId: string = '';
  private concurrency: number;
  private isShuttingDown = false;
  private activeJobs = new Set<string>();
  private pollInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(concurrency: number = parseInt(process.env.WORKER_CONCURRENCY || '5', 10)) {
    this.concurrency = concurrency;
  }

  async start() {
    // Register worker in DB
    const worker = await prisma.worker.create({
      data: {
        hostname: os.hostname(),
        concurrency: this.concurrency,
        status: WorkerStatus.ONLINE,
      },
    });
    this.workerId = worker.id;
    logger.info(`Worker ${this.workerId} started on ${worker.hostname} with concurrency ${this.concurrency}`);

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000);

    // Start polling loop
    this.pollLoop();
  }

  private async heartbeat() {
    if (this.isShuttingDown) return;
    try {
      await prisma.workerHeartbeat.create({
        data: {
          workerId: this.workerId,
          activeJobIds: Array.from(this.activeJobs),
        },
      });
      await prisma.worker.update({
        where: { id: this.workerId },
        data: { lastSeenAt: new Date() },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send heartbeat');
    }
  }

  private async pollLoop() {
    while (!this.isShuttingDown) {
      try {
        if (this.activeJobs.size < this.concurrency) {
          // Find an active queue
          const queues = await prisma.queue.findMany({
            where: { isPaused: false },
          });

          let claimedAny = false;
          for (const queue of queues) {
            if (this.activeJobs.size >= this.concurrency) break;

            // Check queue concurrency limit
            const runningCount = await prisma.job.count({
              where: {
                queueId: queue.id,
                status: { in: ['CLAIMED', 'RUNNING'] },
              },
            });

            if (runningCount >= queue.concurrencyLimit) continue;

            const job = await this.claimJob(queue.id);
            if (job) {
              claimedAny = true;
              this.activeJobs.add(job.id);
              // Fire and forget execution to allow concurrent processing
              this.processJob(job).catch(err => logger.error({ err, jobId: job.id }, 'Job execution wrapper failed'));
            }
          }

          if (!claimedAny) {
            // Backoff slightly if no jobs found
            await new Promise((res) => setTimeout(res, 2000));
          }
        } else {
          // At max concurrency, wait before polling again
          await new Promise((res) => setTimeout(res, 1000));
        }
      } catch (error) {
        logger.error({ error }, 'Error in poll loop');
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  }

  private async claimJob(queueId: string): Promise<Job | null> {
    const result = await prisma.$queryRaw<Job[]>`
      UPDATE "Job" SET status='CLAIMED', "claimedByWorkerId"=${this.workerId}, "claimedAt"=now()
      WHERE id = (
        SELECT id FROM "Job"
        WHERE "queueId" = ${queueId} AND status = 'QUEUED'
          AND ("runAt" IS NULL OR "runAt" <= now())
          AND ("dependsOnJobId" IS NULL OR EXISTS (
            SELECT 1 FROM "Job" dep WHERE dep.id = "Job"."dependsOnJobId" AND dep.status = 'COMPLETED'
          ))
        ORDER BY priority DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING *;
    `;
    return result.length > 0 ? result[0] : null;
  }

  private async processJob(job: Job) {
    try {
      await executeJob(job, this.workerId);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  async shutdown() {
    logger.info('Graceful shutdown initiated...');
    this.isShuttingDown = true;
    
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    await prisma.worker.update({
      where: { id: this.workerId },
      data: { status: WorkerStatus.DRAINING },
    });

    // Wait for active jobs to finish (with a timeout)
    const timeout = new Promise((res) => setTimeout(res, 30000)); // 30s grace period
    
    const waitJobs = async () => {
      while (this.activeJobs.size > 0) {
        await new Promise((res) => setTimeout(res, 500));
      }
    };

    await Promise.race([waitJobs(), timeout]);

    await prisma.worker.update({
      where: { id: this.workerId },
      data: { status: WorkerStatus.OFFLINE },
    });

    logger.info('Shutdown complete.');
  }
}
