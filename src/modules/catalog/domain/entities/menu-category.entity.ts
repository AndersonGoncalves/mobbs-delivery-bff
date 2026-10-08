import { DayOfWeek } from '../../../../shared/utils/day-of-week';
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
  /**
   * specs/0115-categoria-foto-dias-ativos REQ-1/REQ-3 — mostrada pequena à esquerda do nome da
   * categoria na `TabBar` do cardápio do app cliente, quando presente; ausente não reserva
   * espaço nenhum (aditivo, sem mudança de layout pra quem não configurar).
   */
  imageUrl?: string;
  /**
   * specs/0115-categoria-foto-dias-ativos REQ-4/REQ-6/REQ-7 — dias da semana em que a categoria
   * fica visível no app cliente; ausente/vazio = todos os dias (mesmo default permissivo de
   * `isActive: true`). Filtro roda inteiramente client-side (`MenuPageController.load()`, app),
   * mesmo mecanismo de `isActive` — o BFF só guarda e devolve, nunca filtra na leitura.
   */
  activeDays?: DayOfWeek[];
}

/** REQ-1: versão com produtos embutidos (sem `additionalGroups`) — resposta de listagem do cardápio. */
export interface IMenuCategoryWithProducts extends IMenuCategory {
  products: Omit<IProduct, 'additionalGroups'>[];
}
