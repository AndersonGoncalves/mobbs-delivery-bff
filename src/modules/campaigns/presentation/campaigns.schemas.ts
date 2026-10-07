import { z } from 'zod';

export const createCampaignSchema = z.object({
  message: z.string().trim().min(1).max(4096),
  imageUrl: z.string().url().optional(),
});

export type CreateCampaignPayload = z.infer<typeof createCampaignSchema>;
