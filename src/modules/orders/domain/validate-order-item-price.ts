import { IProduct, IProductAdditionalGroup } from '../../catalog/domain/entities/product.entity';
import { IOrderItem, IOrderItemSelection } from './entities/order.entity';

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Soma o `priceDelta` REAL (catálogo atual) de cada seleção, casando por `groupName`/`optionName`
 * — mesma correlação usada por `resolveOrderItemLinkedProducts` (`IOrderItemSelection` nunca
 * guarda id de grupo/opção, ver comentário na entity). `null` = alguma seleção não corresponde a
 * nenhuma opção real do produto (grupo/opção renomeado, removido, ou inventado pelo client) —
 * preço indeterminável, nunca tratado como delta zero.
 */
function sumRealSelectionsPriceDelta(groups: IProductAdditionalGroup[], selections: IOrderItemSelection[]): number | null {
  let total = 0;
  for (const selection of selections) {
    const group = groups.find((candidate) => candidate.name === selection.groupName);
    const option = group?.options.find((candidate) => candidate.name === selection.optionName);
    if (!group || !option) return null;
    total += option.priceDelta ?? 0;
    if (selection.nestedSelections && selection.nestedSelections.length > 0) {
      const nestedTotal = sumRealSelectionsPriceDelta(option.nestedAdditionalGroups ?? [], selection.nestedSelections);
      if (nestedTotal === null) return null;
      total += nestedTotal;
    }
  }
  return total;
}

/**
 * Achado crítico da auditoria pré-produção (31/10/2026) — "preço do pedido nunca é revalidado
 * contra o catálogo real": o client (app/totem/PDV) manda `unitPrice` livremente em cada item, e
 * `computeOrderPricing` só agrega `unitPrice * quantity`, sem olhar pro `Product` de verdade.
 * `unitPrice` já inclui o preço de todos os adicionais por unidade (não existe soma separada de
 * `priceDelta` em `computeOrderPricing`), então o preço esperado aqui é `(promotionalPrice ??
 * price) + soma recursiva dos priceDelta REAIS das seleções` — nunca só `product.price` isolado
 * (isso rejeitaria praticamente todo pedido com adicionais, que é a maioria).
 */
export function computeExpectedItemUnitPrice(product: IProduct, selections: IOrderItemSelection[] = []): number | null {
  const basePrice = product.promotionalPrice ?? product.price;
  const additionalsDelta = sumRealSelectionsPriceDelta(product.additionalGroups, selections);
  if (additionalsDelta === null) return null;
  return roundCents(basePrice + additionalsDelta);
}

export interface OrderItemPriceMismatch {
  itemId: string;
  productId: string;
  productName: string;
  sentUnitPrice: number;
  expectedUnitPrice: number | null;
}

/**
 * Confere cada item do pedido contra o preço REAL (recalculado do catálogo atual) — nunca confia
 * no `unitPrice` mandado pelo client. `productsById` deve conter só produtos já confirmados como
 * do restaurante do pedido (quem chama filtra isso antes — um produto de outro restaurante deve
 * simplesmente estar ausente do mapa, nunca ser passado aqui, senão o preço "real" comparado seria
 * o de um catálogo que não é nem deste pedido). Devolve os itens que não batem (vazio = tudo ok);
 * `expectedUnitPrice: null` cobre tanto "produto ausente do mapa" (não existe mais, ou não é deste
 * restaurante) quanto "seleção não corresponde a opção real" — os dois casos são preço
 * indeterminável e sempre rejeitados por quem chama, nunca aceitos com o valor do client como
 * fallback.
 */
export function findOrderItemPriceMismatches(items: IOrderItem[], productsById: Map<string, IProduct>): OrderItemPriceMismatch[] {
  const mismatches: OrderItemPriceMismatch[] = [];
  for (const item of items) {
    const product = productsById.get(item.productId);
    const expectedUnitPrice = product ? computeExpectedItemUnitPrice(product, item.selections ?? []) : null;
    if (expectedUnitPrice === null || expectedUnitPrice !== roundCents(item.unitPrice)) {
      mismatches.push({
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        sentUnitPrice: item.unitPrice,
        expectedUnitPrice,
      });
    }
  }
  return mismatches;
}
