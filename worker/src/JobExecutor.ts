import { prisma, Job, JobStatus, ExecutionStatus, LogLevel } from 'prisma-db';
import { calculateRetryDelay } from './utils/retry';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export async function executeJob(job: Job, workerId: string) {
  const startedAt = new Date();
  
  // 1. Mark as RUNNING
  await prisma.job.update({
    where: { id: job.id },
    data: { status: JobStatus.RUNNING, startedAt },
  });

  const execution = await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      workerId,
      attemptNumber: job.attemptCount + 1,
      status: ExecutionStatus.RUNNING,
      startedAt,
    },
  });

  try {
    // 2. Mock execution logic (replace with real handler lookup in production)
    logger.info({ jobId: job.id, type: job.type }, 'Executing job...');
    
    // Simulate some work
    await new Promise((res) => setTimeout(res, 500 + Math.random() * 1000));
    
    // Check if payload has a "fail" flag for testing purposes
    const payload = job.payload as any;
    if (payload && payload.simulateFailure) {
      throw new Error(payload.failureMessage || 'Simulated failure');
    }

    const result = { success: true, processedAt: new Date().toISOString() };

    // 3. Success
    const finishedAt = new Date();
    await prisma.$transaction([
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.SUCCESS,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          result,
        },
      }),
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: finishedAt,
          attemptCount: { increment: 1 },
        },
      }),
      prisma.jobLog.create({
        data: {
          jobId: job.id,
          executionId: execution.id,
          level: LogLevel.INFO,
          message: 'Job completed successfully',
        },
      }),
    ]);
  } catch (error: any) {
    logger.error({ jobId: job.id, err: error }, 'Job execution failed');
    
    // 4. Failure Handling
    const finishedAt = new Date();
    const newAttemptCount = job.attemptCount + 1;
    logger.info({ jobId: job.id, attemptCount: newAttemptCount, maxAttempts: job.maxAttempts }, 'Failure handling: checking retry vs DLQ');
    
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: {
        status: ExecutionStatus.FAILED,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: error.message,
      },
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        executionId: execution.id,
        level: LogLevel.ERROR,
        message: `Execution failed: ${error.message}`,
      },
    });

    if (newAttemptCount < job.maxAttempts) {
      // Retry
      let delaySec = 30; // Default
      
      // Fast-track simulated failures to 5 seconds for better dashboard engagement
      const payload = job.payload as any;
      if (payload && payload.simulateFailure) {
        delaySec = 5;
      } else if (job.retryPolicyId) {
        const policy = await prisma.retryPolicy.findUnique({ where: { id: job.retryPolicyId } });
        if (policy) {
          delaySec = calculateRetryDelay(
            policy.strategy,
            newAttemptCount,
            policy.baseDelaySec,
            policy.multiplier,
            policy.maxDelaySec
          );
        }
      }

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.SCHEDULED,
          attemptCount: newAttemptCount,
          runAt: new Date(Date.now() + delaySec * 1000),
        },
      });
      logger.info({ jobId: job.id, delaySec }, 'Job scheduled for retry');
    } else {
      // Dead Letter
      await prisma.$transaction([
        prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.DEAD_LETTER,
            attemptCount: newAttemptCount,
          },
        }),
        prisma.deadLetterJob.create({
          data: {
            jobId: job.id,
            reason: `Max attempts (${job.maxAttempts}) reached. Last error: ${error.message}`,
            payloadSnapshot: job.payload || {},
            attemptCount: newAttemptCount,
          },
        }),
      ]);
      logger.warn({ jobId: job.id }, 'Job moved to Dead Letter Queue');
    }
  }
}
