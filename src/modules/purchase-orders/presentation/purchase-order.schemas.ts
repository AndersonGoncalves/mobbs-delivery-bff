import { z } from 'zod';

const purchaseOrderItemSchema = z.object({
  rawMaterialId: z.string().min(1, 'Item precisa de uma matéria-prima'),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  unitCost: z.number().nonnegative('Custo unitário não pode ser negativo'),
});

/** specs/0015-estoque-compras REQ-2 — ao menos um item. */
export const savePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Fornecedor é obrigatório'),
  items: z.array(purchaseOrderItemSchema).min(1, 'Pedido de compra precisa de ao menos um item'),
});
