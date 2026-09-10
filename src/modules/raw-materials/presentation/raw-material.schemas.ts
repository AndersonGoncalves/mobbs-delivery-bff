import { z } from 'zod';

// specs/0015-estoque-compras — `unit` texto livre (decisão confirmada, spec.md);
// `minimumStockAlert` opcional (`null`/ausente = sem alerta configurado).
export const saveRawMaterialSchema = z.object({
  name: z.string().min(1),
  priceDelta: z.number().nonnegative(),
  unit: z.string().min(1, 'Unidade de medida é obrigatória'),
  minimumStockAlert: z.number().nonnegative().optional(),
});

// REQ-7: `confirmed` só é usado quando o cliente já viu o aviso de produtos afetados e quer
// desativar mesmo assim (mesmo padrão de `confirmReplace` em `AddItemToCartUseCase`,
// specs/0004-carrinho).
export const setRawMaterialActiveSchema = z.object({
  isActive: z.boolean(),
  confirmed: z.boolean().optional(),
});

/** specs/0015-estoque-compras REQ-5 — ajuste manual de estoque, sempre com motivo. */
export const stockAdjustmentSchema = z.object({
  type: z.enum(['entrada', 'saida']),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  reason: z.string().min(1, 'Motivo é obrigatório'),
});
