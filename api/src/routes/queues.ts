import { Router } from 'express';
import { prisma } from 'prisma-db';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createQueueSchema, updateQueueSchema, queueIdParamSchema } from '../schemas/queues';

const router = Router();
router.use(authenticate);

// List queues (optionally filter by projectId)
router.get('/', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const userId = req.user!.userId;

  const whereClause: any = {
    project: {
      organization: {
        memberships: {
          some: { userId },
        },
      },
    },
  };

  if (projectId) {
    whereClause.projectId = projectId;
  }

  const queues = await prisma.queue.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
  });

  res.json({ data: queues });
});

// Create a queue
router.post('/', validate(createQueueSchema), async (req, res) => {
  const { projectId, name, defaultPriority, concurrencyLimit, defaultRetryPolicyId, isPaused } = req.body;
  const userId = req.user!.userId;

  // Validate user has access to the project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: {
        memberships: {
          some: { userId },
        },
      },
    },
  });

  if (!project) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Project not found or access denied' },
    });
  }

  const queue = await prisma.queue.create({
    data: {
      projectId,
      name,
      defaultPriority,
      concurrencyLimit,
      defaultRetryPolicyId,
      isPaused: isPaused ?? false,
    },
  });

  res.status(201).json({ data: queue });
});

// Update a queue
router.patch('/:id', validate(updateQueueSchema), async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const userId = req.user!.userId;
  
  // Validate user has access to the project
  const queueCheck = await prisma.queue.findFirst({
    where: {
      id,
      project: {
        organization: {
          memberships: {
            some: { userId },
          },
        },
      },
    },
  });

  if (!queueCheck) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Queue not found or access denied' },
    });
  }

  const queue = await prisma.queue.update({
    where: { id },
    data,
  });

  res.json({ data: queue });
});

// Pause queue
router.post('/:id/pause', validate(queueIdParamSchema), async (req, res) => {
  const { id } = req.params;
  const queue = await prisma.queue.update({
    where: { id },
    data: { isPaused: true },
  });
  res.json({ data: queue });
});

// Resume queue
router.post('/:id/resume', validate(queueIdParamSchema), async (req, res) => {
  const { id } = req.params;
  const queue = await prisma.queue.update({
    where: { id },
    data: { isPaused: false },
  });
  res.json({ data: queue });
});

// Queue stats
router.get('/:id/stats', validate(queueIdParamSchema), async (req, res) => {
  const { id } = req.params;

  // Aggregate job counts by status
  const jobCounts = await prisma.job.groupBy({
    by: ['status'],
    where: { queueId: id },
    _count: { _all: true },
  });

  const stats = jobCounts.reduce((acc, curr) => {
    acc[curr.status] = curr._count._all;
    return acc;
  }, {} as Record<string, number>);

  res.json({ data: stats });
});

export { router as queuesRouter };
