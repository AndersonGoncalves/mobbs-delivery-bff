import { IProduct, IProductAdditionalGroupInput } from '../entities/product.entity';

export type NewProductInput = {
  menuCategoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  additionalGroups: IProductAdditionalGroupInput[];
  /** specs/0041-item-adicional-vinculado-produto REQ-1 — default `false` quando ausente. */
  availableAsAdditional?: boolean;
  /** specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — ausente/`undefined` =
   * feito sob demanda, sem controle de estoque (ver `IProduct.stockQuantity`). */
  stockQuantity?: number;
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
   * specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login — produtos **disponíveis** do
   * restaurante marcados como destaque (`isFeatured: true`), ordenados por `featuredOrder`.
   * Usado tanto pelo cardápio (cliente) quanto pela seção "Peça também" do Carrinho — endpoint
   * leve dedicado, mesmo espírito de `GET /restaurants/:id/best-sellers` (evita baixar o
   * cardápio inteiro só pra filtrar destaques no cliente).
   */
  getFeatured(restaurantId: string): Promise<IProduct[]>;

  /**
   * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5 — quantos produtos (ativos ou não)
   * pertencem a essa categoria — usado pra bloquear a exclusão real de uma categoria já usada
   * por algum produto.
   */
  countByMenuCategory(restaurantId: string, menuCategoryId: string): Promise<number>;

  /**
   * specs/0041-item-adicional-vinculado-produto REQ-4 — produtos (ativos OU NÃO, mesmo espírito
   * de `countAnyByRawMaterialId`) cuja árvore de `additionalGroups` (recursiva, só grupos
   * inline — grupos vinculados a template são cobertos por
   * `IAdditionalGroupTemplateRepository.findAnyByLinkedProductId`) referencia `linkedProductId`
   * em alguma opção — usado pra bloquear a exclusão real do produto vinculado, listando onde ele
   * é usado.
   */
  findAnyByLinkedProductId(restaurantId: string, linkedProductId: string): Promise<IAffectedProduct[]>;

  /** specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — baixa `quantity` do
   * `stockQuantity` do produto (nunca abaixo de 0); não faz nada se o produto não tiver
   * `stockQuantity` definido (feito sob demanda). Devolve `true` se de fato baixou (produto
   * existe e tem `stockQuantity` definido), `false` caso contrário. */
  decrementStock(id: string, quantity: number): Promise<boolean>;
}
