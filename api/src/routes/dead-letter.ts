import { Router } from 'express';
import { prisma, JobStatus } from 'prisma-db';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { getJobsQuerySchema, deadLetterRetrySchema } from '../schemas/jobs';

const router = Router();
router.use(authenticate);

// List Dead Letter Jobs
router.get('/', validate(getJobsQuerySchema), async (req, res) => {
  const { page, pageSize } = req.query as any;

  const [total, deadLetters] = await Promise.all([
    prisma.deadLetterJob.count(),
    prisma.deadLetterJob.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { failedAt: 'desc' },
      include: {
        job: true,
      }
    }),
  ]);

  res.json({
    data: deadLetters,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// Retry a Dead Letter Job
router.post('/:id/retry', validate(deadLetterRetrySchema), async (req, res) => {
  const { id } = req.params; // this is deadLetterJob ID

  const dlq = await prisma.deadLetterJob.findUnique({ where: { id } });
  if (!dlq) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead letter job not found' } });

  // Update the actual job back to QUEUED
  const updatedJob = await prisma.job.update({
    where: { id: dlq.jobId },
    data: { status: JobStatus.QUEUED, runAt: null, attemptCount: 0 },
  });

  // Mark reprocessed
  await prisma.deadLetterJob.update({
    where: { id },
    data: { reprocessedAt: new Date() }
  });

  res.json({ data: updatedJob, message: 'Job requeued successfully' });
});

export { router as deadLetterRouter };
