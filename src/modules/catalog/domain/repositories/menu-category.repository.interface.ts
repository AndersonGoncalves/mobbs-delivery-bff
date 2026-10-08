import { DayOfWeek } from '../../../../shared/utils/day-of-week';
import { IMenuCategory, IMenuCategoryWithProducts } from '../entities/menu-category.entity';

/** specs/0115-categoria-foto-dias-ativos — mesma semântica de substituição completa que `name`
 * já tem (o formulário da retaguarda sempre manda o estado atual inteiro, não um PATCH parcial):
 * `imageUrl` ausente remove a imagem já salva; `activeDays` ausente/vazio = sem restrição de dia
 * (todos os dias). */
export interface MenuCategoryUpdateInput {
  name: string;
  imageUrl?: string;
  activeDays?: DayOfWeek[];
}

export interface IMenuCategoryRepository {
  /** REQ-1: categorias do restaurante, com produtos (versão leve), ordenadas por `sortOrder`. */
  listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]>;

  /** REQ-1 (retaguarda) — nova categoria entra no fim (`sortOrder` = quantidade atual). */
  create(restaurantId: string, name: string): Promise<IMenuCategory>;

  update(id: string, input: MenuCategoryUpdateInput): Promise<IMenuCategory>;

  /** specs/0061-categoria-ativa-inativa — mesmo padrão de `IProductRepository.setAvailable`. */
  setActive(id: string, isActive: boolean): Promise<IMenuCategory>;

  /** REQ-1: `orderedIds` é a nova ordem completa — `sortOrder` de cada categoria = seu índice. */
  reorder(restaurantId: string, orderedIds: string[]): Promise<IMenuCategory[]>;

  findById(id: string): Promise<IMenuCategory | null>;

  /**
   * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5 — exclusão real, só "dono"
   * (`CatalogController`). Bloqueada pelo controller se a categoria tiver produtos (mesmo
   * raciocínio de `IProductRepository.remove`, que também não decide sozinho a regra de
   * bloqueio).
   */
  remove(id: string): Promise<void>;
}
