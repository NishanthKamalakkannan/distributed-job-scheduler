import { Router } from 'express';
import { prisma } from 'prisma-db';
import { authenticate } from '../middlewares/auth';
import { z } from 'zod';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

const workerIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

// List workers
router.get('/', async (req, res) => {
  const workers = await prisma.worker.findMany({
    orderBy: { lastSeenAt: 'desc' },
  });
  res.json({ data: workers });
});

// Get worker heartbeats
router.get('/:id/heartbeats', validate(workerIdParamSchema), async (req, res) => {
  const { id } = req.params;
  const heartbeats = await prisma.workerHeartbeat.findMany({
    where: { workerId: id },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });
  res.json({ data: heartbeats });
});

export { router as workersRouter };
