import { Router } from 'express';
import { prisma, JobType, JobStatus } from 'prisma-db';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createJobSchema, getJobsQuerySchema, jobIdParamSchema, deadLetterRetrySchema } from '../schemas/jobs';

const router = Router();
router.use(authenticate);

// List Jobs with pagination and filters
router.get('/', validate(getJobsQuerySchema), async (req, res) => {
  const { page, pageSize, queueId, projectId, status, type } = req.query as any;
  
  const whereClause: any = {};
  if (queueId) whereClause.queueId = queueId;
  if (projectId) whereClause.queue = { projectId };
  if (status) whereClause.status = status;
  if (type) whereClause.type = type;

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where: whereClause }),
    prisma.job.findMany({
      where: whereClause,
      include: {
        queue: {
          select: { name: true },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    data: jobs,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// Simulate Traffic for Demo purposes
router.post('/simulate', async (req, res) => {
  const queue = await prisma.queue.findFirst();
  if (!queue) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No queue found' } });

  const now = Date.now();

  // Build job data — updatedAt is set here but Prisma will override it
  const jobsData = Array.from({ length: 50 }).map((_, i) => {
    const isFailure = Math.random() < 0.10; // 10% fail → DEAD_LETTER
    const isFailed  = !isFailure && Math.random() < 0.05; // 5% → FAILED

    const status: JobStatus = isFailure
      ? JobStatus.DEAD_LETTER
      : isFailed
        ? JobStatus.FAILED
        : JobStatus.COMPLETED;

    return {
      queueId: queue.id,
      type: JobType.IMMEDIATE,
      priority: Math.floor(Math.random() * 10),
      status,
      attemptCount: isFailure ? 3 : isFailed ? 2 : 1,
      maxAttempts: 3,
      payload: { task: 'simulate', index: i, complexity: Math.random() },
    };
  });

  // Create all jobs, then backdate updated_at via raw SQL so the chart fills up
  const created = await prisma.$transaction(
    jobsData.map((job) => prisma.job.create({ data: job, select: { id: true } }))
  );

  // Spread the 50 jobs across the last 55 seconds (Prisma overrides updatedAt, so use raw SQL)
  await prisma.$transaction(
    created.map(({ id }, i) => {
      const ageMs = Math.floor(Math.random() * 55000);
      const ts = new Date(now - ageMs);
      return prisma.$executeRaw`UPDATE "Job" SET "updatedAt" = ${ts}, "completedAt" = ${ts} WHERE id = ${id}`;
    })
  );

  res.json({ message: 'Created 50 simulate jobs' });
});

// Create Job(s)
router.post('/', validate(createJobSchema), async (req, res) => {
  const {
    queueId,
    type,
    payload,
    priority,
    idempotencyKey,
    retryPolicyId,
    dependsOnJobId,
    delaySeconds,
    runAt,
    cronExpression,
    name,
    batchPayloads,
  } = req.body;

  // Validate queue exists
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }

  // Idempotency check
  if (idempotencyKey) {
    const existingJob = await prisma.job.findUnique({ where: { idempotencyKey } });
    if (existingJob) {
      return res.status(200).json({ data: existingJob, message: 'Returned existing job due to idempotency key' });
    }
  }

  // Dependency validation
  if (dependsOnJobId) {
    const dependencyJob = await prisma.job.findUnique({ where: { id: dependsOnJobId } });
    if (!dependencyJob) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Dependent job does not exist' } });
    }
    if (dependencyJob.queueId !== queueId) {
       // Typically dependencies are cross-queue in complex systems, but prompt says "same project", here we just check existence.
       // The prompt said: "reject job creation if the referenced job doesn't exist in the same project"
       const depQueue = await prisma.queue.findUnique({ where: { id: dependencyJob.queueId } });
       if (depQueue?.projectId !== queue.projectId) {
         return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Dependent job must be in the same project' } });
       }
    }
  }

  let createdData: any;

  if (type === JobType.IMMEDIATE) {
    createdData = await prisma.job.create({
      data: {
        queueId, type, payload, priority, idempotencyKey, retryPolicyId, dependsOnJobId,
        status: JobStatus.QUEUED,
      },
    });
  } else if (type === JobType.DELAYED) {
    if (!delaySeconds) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'delaySeconds is required for DELAYED job' } });
    const computedRunAt = new Date(Date.now() + delaySeconds * 1000);
    createdData = await prisma.job.create({
      data: {
        queueId, type, payload, priority, idempotencyKey, retryPolicyId, dependsOnJobId,
        status: JobStatus.SCHEDULED,
        runAt: computedRunAt,
      },
    });
  } else if (type === JobType.SCHEDULED) {
    if (!runAt) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'runAt is required for SCHEDULED job' } });
    createdData = await prisma.job.create({
      data: {
        queueId, type, payload, priority, idempotencyKey, retryPolicyId, dependsOnJobId,
        status: JobStatus.SCHEDULED,
        runAt: new Date(runAt),
      },
    });
  } else if (type === JobType.RECURRING) {
    if (!cronExpression || !name) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'cronExpression and name are required for RECURRING job' } });
    // For RECURRING, we create a ScheduledJob instead of a direct Job
    // The scheduler will parse cron and set nextRunAt, but we need an initial value. 
    // For simplicity, we just set nextRunAt to now, the scheduler will pick it up and compute the next proper run.
    createdData = await prisma.scheduledJob.create({
      data: {
        queueId,
        name,
        cronExpression,
        payloadTemplate: payload,
        nextRunAt: new Date(),
      },
    });
  } else if (type === JobType.BATCH) {
    if (!batchPayloads || batchPayloads.length === 0) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'batchPayloads must be provided for BATCH job' } });
    
    // Create a parent job first
    const parentJob = await prisma.job.create({
      data: {
        queueId, type, payload: { type: 'BATCH_PARENT', batchSize: batchPayloads.length }, priority, idempotencyKey,
        status: JobStatus.COMPLETED, // Parent itself doesn't "run", just tracks children
      },
    });

    const childJobsData = batchPayloads.map((bp: any) => ({
      queueId,
      type: JobType.IMMEDIATE,
      payload: bp,
      priority,
      retryPolicyId,
      parentJobId: parentJob.id,
      status: JobStatus.QUEUED,
    }));

    await prisma.job.createMany({ data: childJobsData });
    createdData = parentJob;
  }

  res.status(201).json({ data: createdData });
});

// Get job details (with executions and logs)
router.get('/:id', validate(jobIdParamSchema), async (req, res) => {
  const { id } = req.params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      executions: {
        orderBy: { attemptNumber: 'desc' },
      },
      logs: {
        orderBy: { createdAt: 'desc' },
      },
      deadLetter: true,
    },
  });

  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  res.json({ data: job });
});

// Cancel a job
router.post('/:id/cancel', validate(jobIdParamSchema), async (req, res) => {
  const { id } = req.params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  
  if (['COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'].includes(job.status)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Cannot cancel job in status ${job.status}` } });
  }

  const updatedJob = await prisma.job.update({
    where: { id },
    data: { status: JobStatus.CANCELLED },
  });

  res.json({ data: updatedJob });
});

// Manual Retry
router.post('/:id/retry', validate(jobIdParamSchema), async (req, res) => {
  const { id } = req.params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });

  if (job.status !== JobStatus.FAILED && job.status !== JobStatus.DEAD_LETTER) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Can only retry FAILED or DEAD_LETTER jobs. Current: ${job.status}` } });
  }

  const updatedJob = await prisma.job.update({
    where: { id },
    data: { status: JobStatus.QUEUED, runAt: null, attemptCount: 0 },
  });

  res.json({ data: updatedJob });
});

export { router as jobsRouter };
