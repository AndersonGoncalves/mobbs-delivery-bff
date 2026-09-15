import { IProduct, IProductAdditionalGroupInput } from '../entities/product.entity';

export type NewProductInput = {
  menuCategoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  additionalGroups: IProductAdditionalGroupInput[];
};

export type ProductUpdateInput = Partial<NewProductInput>;

/** REQ-7 (`specs/0007-cadastro-produtos`) — produto ativo que referencia um `RawMaterial`. */
export interface IAffectedProduct {
  id: string;
  name: string;
}

/** specs/0026-selecao-clonar-excluir-busca-web REQ-7 — busca por nome (parcial) + disponibilidade. */
export interface IProductListFilters {
  name?: string;
  isAvailable?: boolean;
}

export interface IProductRepository {
  /** REQ-3: produto completo (com `additionalGroups`) — `null` se o `id` não existir. */
  findById(id: string): Promise<IProduct | null>;

  /** REQ-2 (retaguarda) — todos os produtos do restaurante do operador, com `additionalGroups`. */
  listByRestaurant(restaurantId: string, filters?: IProductListFilters): Promise<IProduct[]>;

  create(restaurantId: string, input: NewProductInput): Promise<IProduct>;

  update(id: string, input: ProductUpdateInput): Promise<IProduct>;

  setAvailable(id: string, isAvailable: boolean): Promise<IProduct>;

  /** specs/0026-selecao-clonar-excluir-busca-web REQ-4 — exclusão real (diferente de setAvailable). */
  remove(id: string): Promise<void>;

  /**
   * REQ-7: produtos **ativos** do restaurante cuja árvore de `additionalGroups` (recursiva)
   * referencia `rawMaterialId` em algum nível — usado pra avisar antes de desativar um
   * `RawMaterial`.
   */
  findActiveByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<IAffectedProduct[]>;

  /**
   * specs/0025-adicionais-reutilizaveis-remocao REQ-4 — produtos **ativos** do restaurante com
   * algum grupo de 1º nível vinculado (`templateId`) ao template dado — usado pra avisar antes de
   * desativar um `AdditionalGroupTemplate`.
   */
  findActiveByTemplateId(restaurantId: string, templateId: string): Promise<IAffectedProduct[]>;

  /**
   * specs/0026-selecao-clonar-excluir-busca-web REQ-5 — quantos produtos (ATIVOS OU NÃO,
   * diferente de `findActiveByRawMaterialId`) referenciam esse `rawMaterialId` — usado pra
   * bloquear a exclusão real de uma matéria-prima já usada alguma vez.
   */
  countAnyByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<number>;

  /** REQ-5 — idem, pra `AdditionalGroupTemplate` (qualquer produto, ativo ou não). */
  countAnyByTemplateId(restaurantId: string, templateId: string): Promise<number>;

  /**
   * specs/0028-destaques-vendidos-banners REQ-3 — reatribui `featuredOrder` sequencial (0, 1, 2,
   * ...) aos produtos do restaurante na ordem recebida em `orderedIds` (mesmo padrão de
   * `MenuCategoryRepository.reorder`). Só reordena — não altera `isFeatured`.
   */
  reorderFeatured(restaurantId: string, orderedIds: string[]): Promise<IProduct[]>;

  /**
   * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5 — quantos produtos (ativos ou não)
   * pertencem a essa categoria — usado pra bloquear a exclusão real de uma categoria já usada
   * por algum produto.
   */
  countByMenuCategory(restaurantId: string, menuCategoryId: string): Promise<number>;
}
