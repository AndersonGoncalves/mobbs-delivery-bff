/**
 * docs/architecture/data-model.md §Product/§ProductAdditionalGroup/§ProductAdditionalOption —
 * os 4 arquétipos de produto (sem variação, sabor único obrigatório, adicionais opcionais,
 * produto composto) usam esta mesma estrutura recursiva, nunca entidades separadas.
 */
export interface IProductAdditionalOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  rawMaterialId?: string;
  /**
   * specs/0041-item-adicional-vinculado-produto REQ-2/REQ-3 — referência opcional a um
   * `IProduct` já cadastrado (produto vendável, ex. "Coca-Cola 1L"), mutuamente exclusiva com
   * `rawMaterialId` (nunca os dois preenchidos ao mesmo tempo, validado em `catalog.schemas.ts`).
   * Diferente de `rawMaterialId` (só guarda o vínculo, `name`/`priceDelta` não são
   * resincronizados): `name`/`imageUrl` de uma opção com `linkedProductId` são resolvidos "ao
   * vivo" a partir do produto vinculado em toda leitura (mesmo mecanismo de resolução já usado
   * pra `templateId` abaixo) — só `priceDelta` continua sendo digitado livremente por opção.
   */
  linkedProductId?: string;
  nestedAdditionalGroups?: IProductAdditionalGroup[];
  /**
   * specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — corrige
   * `specs/0029` REQ-3: a foto pertence a cada **opção** do grupo (mostrada na linha da opção,
   * entre o texto e o controle de seleção), não ao grupo inteiro. Numa opção vinda de grupo
   * vinculado a template, é resolvida do template junto com o resto dos campos (mesmo mecanismo
   * de `name`/`priceDelta`/etc.). Numa opção com `linkedProductId`, é resolvida do produto
   * vinculado (specs/0041).
   */
  imageUrl?: string;
}

/**
 * specs/0025-adicionais-reutilizaveis-remocao REQ-2/REQ-3/REQ-8 — `templateId` presente marca um
 * grupo **vinculado** a um `IAdditionalGroupTemplate` (`modules/additional-group-templates`):
 * `name`/`type`/`required`/`minSelections`/`maxSelections`/`options` são resolvidos a partir do
 * template atual em toda leitura (`ProductMongooseRepository`), nunca sincronizados por escrita —
 * o que fica persistido nesses campos quando há `templateId` é só o último snapshot conhecido
 * (rede de segurança se o template for apagado, nunca lido em uso normal). Só grupos de 1º nível
 * podem ter `templateId` — `nestedAdditionalGroups` (produto composto) nunca vincula a template
 * nesta v1 (`plan.md` §Arquitetura da solução).
 */
export type AdditionalGroupType = 'adicionar' | 'remover';

export interface IProductAdditionalGroup {
  id: string;
  productId: string;
  templateId?: string;
  name: string;
  type: AdditionalGroupType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: IProductAdditionalOption[];
}

/**
 * Forma mínima aceita na **escrita** pra um grupo vinculado — o cliente manda só a referência
 * (`catalog.schemas.ts`, `productAdditionalGroupReferenceSchema`); `name`/`type`/`required`/etc.
 * não fazem sentido no payload porque vêm do template, não do cliente. `IProductAdditionalGroup`
 * continua sendo a forma de **leitura**, sempre completa (resolvida antes de responder).
 */
export interface IProductAdditionalGroupReference {
  id: string;
  productId: string;
  templateId: string;
}

export type IProductAdditionalGroupInput = IProductAdditionalGroup | IProductAdditionalGroupReference;

export interface IProduct {
  id: string;
  restaurantId: string;
  menuCategoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  additionalGroups: IProductAdditionalGroup[];
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — `additionalGroups.length > 0`,
   * calculado sem carregar a árvore inteira nas listagens leves (`menu-category.mongoose.
   * repository.ts`, `GET /restaurants/:id/best-sellers`); decide "A partir de R$ X" vs. "R$ X" no
   * card do app cliente. Opcional porque nem toda leitura de `IProduct` precisa dele (a leitura
   * completa já tem `additionalGroups` de verdade, de onde dá pra derivar isso direto). */
  hasAdditionalGroups?: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-3 — marca manual de "aparece na seção
   * Destaques do cardápio do cliente". Independente de `isAvailable`. */
  isFeatured: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-3 — ordem de exibição dentro de "Destaques",
   * só relevante quando `isFeatured === true` (mesmo padrão de `MenuCategory.sortOrder`: campo
   * persistido, não posição implícita no array — permite reordenar em lote). */
  featuredOrder: number;
  /** specs/0041-item-adicional-vinculado-produto REQ-1 — marca este produto como candidato a
   * ser escolhido (`linkedProductId`) como opção de um grupo de adicionais de OUTRO produto —
   * default `false`, não afeta a listagem/venda normal deste produto. */
  availableAsAdditional: boolean;
  /** specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — controle de estoque do
   * produto "de prateleira" (mesma semântica já documentada pro `ProductAdmin` do lado web,
   * `docs/architecture/data-model.md` §ProductAdmin: `undefined`/`null` = feito sob demanda, sem
   * controle de estoque nenhum; um número = quantidade disponível, baixada automaticamente
   * quando um pedido com este produto — vendido avulso ou como adicional vinculado,
   * `specs/0041` — muda pra `entregue`). */
  stockQuantity?: number;
}
