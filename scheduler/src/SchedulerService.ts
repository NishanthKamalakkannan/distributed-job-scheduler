import { prisma, JobStatus, JobType } from 'prisma-db';
import cron from 'node-cron';
import cronParser from 'cron-parser';
import pino from 'pino';
import os from 'os';
import { randomUUID } from 'crypto';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class SchedulerService {
  private instanceId = randomUUID();
  private hostname = os.hostname();
  private tasks: cron.ScheduledTask[] = [];

  start() {
    logger.info(`Scheduler ${this.instanceId} started on ${this.hostname}`);
    
    // 1. Tick for recurring jobs (runs every 10 seconds)
    const recurringTask = cron.schedule('*/10 * * * * *', () => this.processRecurringJobs());
    this.tasks.push(recurringTask);

    // 2. Reaper for dead workers (runs every 1 minute)
    const reaperTask = cron.schedule('0 * * * * *', () => this.reapDeadWorkers());
    this.tasks.push(reaperTask);
  }

  private async processRecurringJobs() {
    try {
      const dueJobs = await prisma.scheduledJob.findMany({
        where: {
          isActive: true,
          nextRunAt: { lte: new Date() },
        },
      });

      for (const scheduledJob of dueJobs) {
        // Atomic Lock Check
        const lockResult = await prisma.$queryRaw<any[]>`
          UPDATE "ScheduledJob" SET "lockedBy"=${this.instanceId}, "lockedUntil"=now() + interval '30 seconds'
          WHERE id = ${scheduledJob.id}::uuid AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
          RETURNING *;
        `;

        if (lockResult.length === 0) {
          // Another scheduler grabbed it
          continue;
        }

        const lockedJob = lockResult[0];

        // Spawn actual job
        await prisma.job.create({
          data: {
            queueId: lockedJob.queueId,
            type: JobType.RECURRING,
            status: JobStatus.QUEUED,
            payload: lockedJob.payloadTemplate,
            scheduledJobId: lockedJob.id,
          },
        });

        // Compute next run using cron-parser
        let nextRun = new Date(Date.now() + 60000); // Fallback
        try {
          const interval = cronParser.parseExpression(lockedJob.cronExpression);
          nextRun = interval.next().toDate();
        } catch (err) {
          logger.error({ err, scheduledJobId: lockedJob.id }, 'Error parsing cron expression');
        }

        // Update the schedule and release lock
        await prisma.scheduledJob.update({
          where: { id: lockedJob.id },
          data: {
            lastRunAt: new Date(),
            nextRunAt: nextRun,
            lockedBy: null,
            lockedUntil: null,
          },
        });
        
        logger.info({ scheduledJobId: lockedJob.id }, 'Spawned recurring job');
      }
    } catch (err) {
      logger.error({ err }, 'Error in processRecurringJobs tick');
    }
  }

  private async reapDeadWorkers() {
    try {
      const STALE_THRESHOLD_MS = 30000; // 30 seconds
      const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS);

      const deadWorkers = await prisma.worker.findMany({
        where: {
          status: 'ONLINE',
          lastSeenAt: { lt: staleTime },
        },
      });

      for (const worker of deadWorkers) {
        logger.warn({ workerId: worker.id }, 'Reaping dead worker');

        // Mark worker offline
        await prisma.worker.update({
          where: { id: worker.id },
          data: { status: 'OFFLINE' },
        });

        // Fail running executions and requeue jobs
        const runningExecutions = await prisma.jobExecution.findMany({
          where: {
            workerId: worker.id,
            status: 'RUNNING',
          },
          include: { job: true },
        });

        for (const exec of runningExecutions) {
          await prisma.$transaction([
            prisma.jobExecution.update({
              where: { id: exec.id },
              data: {
                status: 'FAILED',
                finishedAt: new Date(),
                errorMessage: 'Worker died unexpectedly',
              },
            }),
            prisma.jobLog.create({
              data: {
                jobId: exec.jobId,
                executionId: exec.id,
                level: 'ERROR',
                message: 'Worker crashed or stopped responding',
              },
            }),
            // Requeue the job (reset attempt count for the crash, or increment it. We'll requeue immediately)
            prisma.job.update({
              where: { id: exec.jobId },
              data: {
                status: 'QUEUED',
                claimedByWorkerId: null,
                startedAt: null,
                runAt: null,
              },
            }),
          ]);
          logger.info({ jobId: exec.jobId }, 'Requeued orphaned job');
        }

        // Also reap jobs stuck in CLAIMED state where worker died before execution started
        const claimedJobs = await prisma.job.findMany({
          where: {
            claimedByWorkerId: worker.id,
            status: 'CLAIMED'
          }
        });

        for (const job of claimedJobs) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: 'QUEUED',
              claimedByWorkerId: null,
              startedAt: null,
              runAt: null,
            },
          });
          logger.info({ jobId: job.id }, 'Requeued stuck CLAIMED job');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in reapDeadWorkers tick');
    }
  }

  shutdown() {
    logger.info('Shutting down scheduler...');
    for (const task of this.tasks) {
      task.stop();
    }
  }
}
