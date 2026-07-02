import { z } from 'zod';
import { JobType } from 'prisma-db';

const baseJobPayload = z.object({
  queueId: z.string().uuid(),
  type: z.nativeEnum(JobType),
  payload: z.record(z.any()),
  priority: z.number().int().optional(),
  idempotencyKey: z.string().optional(),
  retryPolicyId: z.string().uuid().optional(),
  dependsOnJobId: z.string().uuid().optional(),
});

export const createJobSchema = z.object({
  body: baseJobPayload.extend({
    // For DELAYED
    delaySeconds: z.number().int().min(1).optional(),
    // For SCHEDULED
    runAt: z.string().datetime().optional(),
    // For RECURRING
    cronExpression: z.string().optional(),
    name: z.string().optional(), // name for scheduled job
    // For BATCH
    batchPayloads: z.array(z.record(z.any())).min(1).optional(),
  }),
});

export const getJobsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    queueId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    status: z.string().optional(),
    type: z.nativeEnum(JobType).optional(),
  }),
});

export const jobIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deadLetterRetrySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
