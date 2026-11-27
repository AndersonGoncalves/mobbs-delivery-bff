import { z } from 'zod';

import { paginationQuerySchema } from '../../../shared/http/pagination';
import { isReversedRange } from '../../../shared/utils/inclusive-end-date';

// Pedido explícito do usuário (follow-up) — item do pedido de compra pode ser matéria-prima OU
// um produto pronto pra revenda (ex. refrigerante), nunca os dois; `superRefine` valida a
// exclusividade mútua (mesmo padrão de `rawMaterialId`/`linkedProductId` em `catalog.schemas.ts`).
const purchaseOrderItemSchema = z
  .object({
    rawMaterialId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    quantity: z.number().positive('Quantidade deve ser maior que zero'),
    unitCost: z.number().nonnegative('Custo unitário não pode ser negativo'),
  })
  .superRefine((item, ctx) => {
    if (!item.rawMaterialId && !item.productId) {
      ctx.addIssue({ code: 'custom', message: 'Item precisa de uma matéria-prima ou um produto', path: ['rawMaterialId'] });
    }
    if (item.rawMaterialId && item.productId) {
      ctx.addIssue({ code: 'custom', message: 'Item não pode ter matéria-prima e produto ao mesmo tempo', path: ['productId'] });
    }
  });

/** specs/0015-estoque-compras REQ-2 — ao menos um item. */
export const savePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Fornecedor é obrigatório'),
  items: z.array(purchaseOrderItemSchema).min(1, 'Pedido de compra precisa de ao menos um item'),
});

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');

/**
 * specs/0231-filtro-datas-contas-pedidos-compra REQ-2/REQ-5/REQ-6 — tudo OPCIONAL: `from`/`to`
 * (data do pedido, `to` inclusivo), `status`, `supplier` (busca parcial pelo nome do fornecedor) e
 * `page`/`pageSize` (omitidos → lista inteira filtrada, como antes). "de" depois de "até" → 400.
 */
export const purchaseOrderListQuerySchema = z
  .object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    status: z.enum(['aberto', 'recebido', 'cancelado']).optional(),
    supplier: z.string().trim().min(1).optional(),
  })
  .merge(paginationQuerySchema)
  .refine(({ from, to }) => !isReversedRange(from, to), 'Data inicial não pode ser posterior à data final');
