import { IProductAdditionalGroup } from '../../catalog/domain/entities/product.entity';
import { IOrderItemSelection } from './entities/order.entity';

/**
 * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — resolve `linkedProductId`
 * (`specs/0041`) de cada seleção casando `groupName`/`optionName` contra a árvore atual de
 * `additionalGroups` do produto (única correlação possível — `IOrderItemSelection` nunca guarda
 * ids de grupo/opção, ver comentário na entity). Pura (sem I/O) — testável sem mocar Mongo,
 * mesma convenção de `resolveGroup`/`resolveOptionLinkedProduct`
 * (`catalog/infra/repositories/product.mongoose.repository.ts`). Recursiva em
 * `nestedSelections`/`nestedAdditionalGroups` pra cobrir produto composto.
 */
export function resolveOrderItemLinkedProducts(
  selections: IOrderItemSelection[],
  groups: IProductAdditionalGroup[],
): IOrderItemSelection[] {
  return selections.map((selection) => {
    const group = groups.find((candidate) => candidate.name === selection.groupName);
    const option = group?.options.find((candidate) => candidate.name === selection.optionName);
    const nestedSelections =
      selection.nestedSelections && option?.nestedAdditionalGroups
        ? resolveOrderItemLinkedProducts(selection.nestedSelections, option.nestedAdditionalGroups)
        : selection.nestedSelections;
    return {
      ...selection,
      linkedProductId: option?.linkedProductId,
      ...(nestedSelections ? { nestedSelections } : {}),
    };
  });
}
