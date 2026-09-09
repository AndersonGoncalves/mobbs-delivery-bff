import { z } from 'zod';

export const saveRawMaterialSchema = z.object({
  name: z.string().min(1),
  priceDelta: z.number().nonnegative(),
});

// REQ-7: `confirmed` só é usado quando o cliente já viu o aviso de produtos afetados e quer
// desativar mesmo assim (mesmo padrão de `confirmReplace` em `AddItemToCartUseCase`,
// specs/0004-carrinho).
export const setRawMaterialActiveSchema = z.object({
  isActive: z.boolean(),
  confirmed: z.boolean().optional(),
});
