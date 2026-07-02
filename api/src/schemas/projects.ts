import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    organizationId: z.string().uuid(),
  }),
});
