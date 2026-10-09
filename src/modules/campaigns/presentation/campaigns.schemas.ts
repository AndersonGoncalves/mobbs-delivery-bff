import { z } from 'zod';

export const createCampaignSchema = z.object({
  message: z.string().trim().min(1).max(4096),
  imageUrl: z.string().url().optional(),
  // Pedido explícito do usuário (follow-up) — clientes excluídos deste disparo; ausente/vazio =
  // manda pra todo cliente elegível (default atual).
  excludedCustomerIds: z.array(z.string()).optional(),
});

export type CreateCampaignPayload = z.infer<typeof createCampaignSchema>;
