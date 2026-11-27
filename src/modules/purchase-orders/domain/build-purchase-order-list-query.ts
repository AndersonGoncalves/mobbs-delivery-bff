import { PurchaseOrderStatus } from './entities/purchase-order.entity';

export interface PurchaseOrderListFilters {
  /** Data do pedido (`createdAt`), limite inicial. */
  from?: Date;
  /** Data do pedido (`createdAt`), limite final INCLUSIVO (controller já converte data pura pro fim do dia). */
  to?: Date;
  status?: PurchaseOrderStatus;
  /** Ids dos fornecedores cujo nome casou com a busca — `[]` significa "nenhum casou" (lista vazia),
   * `undefined` significa "sem busca por fornecedor". */
  supplierIds?: string[];
}

/**
 * specs/0231-filtro-datas-contas-pedidos-compra REQ-2/REQ-4 — mesma regra de
 * `buildAccountListQuery` (financeiro), agora pela data do pedido: sem período e sem `status`,
 * todo pedido `'aberto'` (de qualquer idade) + o resto dos últimos 12 meses; com período, filtro
 * simples de `createdAt`. `status` sem período: `'aberto'` traz todos os abertos, os demais
 * mantêm a janela de 12 meses.
 */
export function buildPurchaseOrderListQuery(restaurantId: string, filters?: PurchaseOrderListFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { restaurantId };
  if (filters?.from || filters?.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.$gte = filters.from;
    if (filters.to) createdAt.$lte = filters.to;
    query.createdAt = createdAt;
    if (filters.status) query.status = filters.status;
  } else {
    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 12);
    if (!filters?.status) {
      query.$or = [{ status: 'aberto' }, { createdAt: { $gte: defaultFrom } }];
    } else {
      query.status = filters.status;
      if (filters.status !== 'aberto') query.createdAt = { $gte: defaultFrom };
    }
  }
  if (filters?.supplierIds) query.supplierId = { $in: filters.supplierIds };
  return query;
}
