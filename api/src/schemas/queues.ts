import { z } from 'zod';

export const createQueueSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(255),
    defaultPriority: z.number().int().optional(),
    concurrencyLimit: z.number().int().min(1).optional(),
    defaultRetryPolicyId: z.string().uuid().optional(),
    isPaused: z.boolean().optional(),
  }),
});

export const updateQueueSchema = z.object({
  body: z.object({
    defaultPriority: z.number().int().optional(),
    concurrencyLimit: z.number().int().min(1).optional(),
    defaultRetryPolicyId: z.string().uuid().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const queueIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
