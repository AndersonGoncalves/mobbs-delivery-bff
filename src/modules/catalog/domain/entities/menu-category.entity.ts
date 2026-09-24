import { IProduct } from './product.entity';

/** docs/architecture/data-model.md §MenuCategory */
export interface IMenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  /**
   * specs/0061-categoria-ativa-inativa — liga/desliga a categoria no cardápio do app cliente:
   * `false` esconde a aba dessa categoria na `TabBar` de `menu_page.dart` (e, por consequência,
   * seus produtos somem da busca também — mesma lista alimenta os dois). Default `true`. Não
   * bloqueia nada na retaguarda (a categoria continua editável/com produtos) — diferente de
   * excluir, que é bloqueado se ainda tiver produtos.
   */
  isActive: boolean;
}

/** REQ-1: versão com produtos embutidos (sem `additionalGroups`) — resposta de listagem do cardápio. */
export interface IMenuCategoryWithProducts extends IMenuCategory {
  products: Omit<IProduct, 'additionalGroups'>[];
}
