import { z } from 'zod';

export const sendHeartbeatSchema = z.object({
  sessionId: z.string().min(1),
});
