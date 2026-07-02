import { PrismaClient, JobStatus, JobType, ExecutionStatus, LogLevel, WorkerStatus, RetryStrategy } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Clean existing data
  await prisma.jobLog.deleteMany();
  await prisma.jobExecution.deleteMany();
  await prisma.deadLetterJob.deleteMany();
  await prisma.job.deleteMany();
  await prisma.scheduledJob.deleteMany();
  await prisma.queue.deleteMany();
  await prisma.retryPolicy.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workerHeartbeat.deleteMany();
  await prisma.worker.deleteMany();

  // Create User
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      name: 'Admin User',
      passwordHash,
    },
  });

  // Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Corp',
      memberships: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
  });

  // Create Projects
  const project1 = await prisma.project.create({
    data: {
      name: 'Main Processing',
      organizationId: org.id,
      createdById: user.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Analytics Pipeline',
      organizationId: org.id,
      createdById: user.id,
    },
  });

  // Create Retry Policy
  const retryPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'Standard Exponential Policy',
      strategy: RetryStrategy.EXPONENTIAL,
      maxAttempts: 3,
      baseDelaySec: 5,
      multiplier: 2.0,
      maxDelaySec: 60,
    },
  });

  // Create Queues for Project 1
  const queueDefault = await prisma.queue.create({
    data: {
      projectId: project1.id,
      name: 'default',
      concurrencyLimit: 10,
      defaultRetryPolicyId: retryPolicy.id,
    },
  });

  const queueHigh = await prisma.queue.create({
    data: {
      projectId: project1.id,
      name: 'high-priority',
      concurrencyLimit: 5,
      defaultRetryPolicyId: retryPolicy.id,
    },
  });

  // Create Queue for Project 2
  const queueReports = await prisma.queue.create({
    data: {
      projectId: project2.id,
      name: 'reports',
      concurrencyLimit: 3,
      defaultRetryPolicyId: retryPolicy.id,
    },
  });

  // Create Workers (Clean sequentially named workers)
  const workerA = await prisma.worker.create({
    data: {
      hostname: 'worker-us-east-1a',
      status: WorkerStatus.ONLINE,
      concurrency: 5,
    },
  });

  const workerB = await prisma.worker.create({
    data: {
      hostname: 'worker-us-east-1b',
      status: WorkerStatus.ONLINE,
      concurrency: 5,
    },
  });

  // --- Seed Jobs for Project 1: default queue ---

  // 1. QUEUED Job (Immediate)
  await prisma.job.create({
    data: {
      queueId: queueDefault.id,
      type: JobType.IMMEDIATE,
      status: JobStatus.QUEUED,
      priority: 3,
      maxAttempts: 3,
      retryPolicyId: retryPolicy.id,
      payload: { action: 'send_email', to: 'customer@example.com', template: 'welcome' },
    },
  });

  // 2. DELAYED Job (Scheduled status, runAt in future)
  await prisma.job.create({
    data: {
      queueId: queueDefault.id,
      type: JobType.DELAYED,
      status: JobStatus.SCHEDULED,
      priority: 1,
      runAt: new Date(Date.now() + 600 * 1000), // 10 minutes in future
      payload: { action: 'send_reminder', userId: 'user_987' },
    },
  });

  // 3. SCHEDULED Job (Specific runAt tomorrow)
  await prisma.job.create({
    data: {
      queueId: queueDefault.id,
      type: JobType.SCHEDULED,
      status: JobStatus.SCHEDULED,
      priority: 2,
      runAt: new Date(Date.now() + 24 * 3600 * 1000), // tomorrow
      payload: { action: 'cleanup_sessions', force: true },
    },
  });

  // 4. RECURRING Job template in ScheduledJob table
  await prisma.scheduledJob.create({
    data: {
      queueId: queueDefault.id,
      name: 'Hourly Database Backup',
      cronExpression: '0 * * * *',
      payloadTemplate: { task: 'db_backup', target: 's3://backups/' },
      isActive: true,
      nextRunAt: new Date(Date.now() + 1800 * 1000), // in 30 minutes
    },
  });

  // 5. BATCH Job (1 parent + 3 children)
  const parentJob = await prisma.job.create({
    data: {
      queueId: queueDefault.id,
      type: JobType.BATCH,
      status: JobStatus.COMPLETED,
      payload: { type: 'BATCH_PARENT', batchSize: 3 },
      priority: 5,
    },
  });

  for (let i = 1; i <= 3; i++) {
    await prisma.job.create({
      data: {
        queueId: queueDefault.id,
        type: JobType.IMMEDIATE,
        status: JobStatus.QUEUED,
        parentJobId: parentJob.id,
        priority: 5,
        payload: { action: 'process_batch_item', itemId: `item_${i}`, parentId: parentJob.id },
      },
    });
  }

  // 6. RUNNING Job
  const runningJob = await prisma.job.create({
    data: {
      queueId: queueHigh.id,
      type: JobType.IMMEDIATE,
      status: JobStatus.RUNNING,
      payload: { action: 'process_large_video', videoId: 1002 },
      claimedByWorkerId: workerA.id,
      startedAt: new Date(),
    },
  });

  await prisma.jobExecution.create({
    data: {
      jobId: runningJob.id,
      workerId: workerA.id,
      attemptNumber: 1,
      status: ExecutionStatus.RUNNING,
    },
  });

  // 7. COMPLETED Job with Execution log
  const completedJob = await prisma.job.create({
    data: {
      queueId: queueHigh.id,
      type: JobType.IMMEDIATE,
      status: JobStatus.COMPLETED,
      payload: { action: 'generate_revenue_report', quarter: 'Q2' },
      claimedByWorkerId: workerB.id,
      startedAt: new Date(Date.now() - 120000),
      completedAt: new Date(),
      attemptCount: 1,
    },
  });

  const completedExec = await prisma.jobExecution.create({
    data: {
      jobId: completedJob.id,
      workerId: workerB.id,
      attemptNumber: 1,
      status: ExecutionStatus.SUCCESS,
      startedAt: new Date(Date.now() - 120000),
      finishedAt: new Date(),
      durationMs: 82000,
      result: { status: 'success', s3_key: 'reports/Q2_revenue.pdf' },
    },
  });

  await prisma.jobLog.create({
    data: {
      jobId: completedJob.id,
      executionId: completedExec.id,
      level: LogLevel.INFO,
      message: 'Revenue document compiled successfully. Uploaded to S3 storage bucket.',
    },
  });

  // 8. FAILED Job (Scheduled status, waiting for retry attempt 2)
  const failedJob = await prisma.job.create({
    data: {
      queueId: queueDefault.id,
      type: JobType.IMMEDIATE,
      status: JobStatus.SCHEDULED,
      payload: { action: 'sync_crm_contacts' },
      attemptCount: 1,
      maxAttempts: 3,
      retryPolicyId: retryPolicy.id,
      runAt: new Date(Date.now() + 15000), // Retry in 15s
    },
  });

  const failedExec = await prisma.jobExecution.create({
    data: {
      jobId: failedJob.id,
      workerId: workerA.id,
      attemptNumber: 1,
      status: ExecutionStatus.FAILED,
      startedAt: new Date(Date.now() - 30000),
      finishedAt: new Date(),
      errorMessage: '504 Gateway Timeout from CRM service API',
    },
  });

  await prisma.jobLog.create({
    data: {
      jobId: failedJob.id,
      executionId: failedExec.id,
      level: LogLevel.ERROR,
      message: 'Failed execution: 504 Gateway Timeout from CRM service API',
    },
  });

  // 9. DEAD LETTER Job
  const deadJob = await prisma.job.create({
    data: {
      queueId: queueReports.id,
      type: JobType.IMMEDIATE,
      status: JobStatus.DEAD_LETTER,
      payload: { action: 'compress_archives', path: '/var/log/old_logs' },
      attemptCount: 3,
      maxAttempts: 3,
    },
  });

  await prisma.deadLetterJob.create({
    data: {
      jobId: deadJob.id,
      reason: 'Max attempts reached. Last error: Disk quota exceeded (ENOSPC)',
      payloadSnapshot: { action: 'compress_archives', path: '/var/log/old_logs' },
      attemptCount: 3,
    },
  });

  console.log('Seed completed.');
  console.log('Login with: admin@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
