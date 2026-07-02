import { Router } from 'express';
import { prisma } from 'prisma-db';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createProjectSchema } from '../schemas/projects';

const router = Router();
router.use(authenticate);

// Get all projects for user's organizations
router.get('/', async (req, res) => {
  const userId = req.user!.userId;

  const projects = await prisma.project.findMany({
    where: {
      organization: {
        memberships: {
          some: { userId },
        },
      },
    },
    include: {
      organization: true,
      _count: {
        select: { queues: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ data: projects });
});

// Create a new project
router.post('/', validate(createProjectSchema), async (req, res) => {
  const { name, organizationId } = req.body;
  const userId = req.user!.userId;

  // Validate user belongs to the org
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this organization' },
    });
  }

  const project = await prisma.project.create({
    data: {
      name,
      organizationId,
      createdById: userId,
    },
  });

  res.status(201).json({ data: project });
});

export { router as projectsRouter };
