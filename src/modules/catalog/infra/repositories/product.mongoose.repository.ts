import { IProduct, IProductAdditionalGroup, IProductAdditionalOption } from '../../domain/entities/product.entity';
import {
  IAffectedProduct,
  IProductListFilters,
  IProductRepository,
  NewProductInput,
  ProductUpdateInput,
} from '../../domain/repositories/product.repository.interface';
import { escapeRegex } from '../../../../shared/utils/escape-regex';
import { AdditionalGroupTemplateModel } from '../../../additional-group-templates/infra/models/additional-group-template.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';

interface ProductLeanDocument extends Omit<IProduct, 'id'> {
  _id: string;
}

export interface AdditionalGroupTemplateLeanDocument {
  _id: string;
  name: string;
  type: 'adicionar' | 'remover';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: { id: string; name: string; priceDelta: number; rawMaterialId?: string; linkedProductId?: string; imageUrl?: string }[];
}

interface LinkedProductLeanDocument {
  _id: string;
  name: string;
  imageUrl?: string;
}

function toEntity(doc: ProductLeanDocument): IProduct {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    menuCategoryId: doc.menuCategoryId,
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    price: doc.price,
    isAvailable: doc.isAvailable,
    additionalGroups: doc.additionalGroups ?? [],
    isFeatured: doc.isFeatured ?? false,
    featuredOrder: doc.featuredOrder ?? 0,
    availableAsAdditional: doc.availableAsAdditional ?? false,
  };
}

// REQ-7 (`specs/0007-cadastro-produtos`) — desce a árvore recursiva de `additionalGroups`
// procurando alguma opção que referencie `rawMaterialId`, em qualquer nível de aninhamento
// (produto composto, arquétipo 4).
function referencesRawMaterial(groups: IProductAdditionalGroup[], rawMaterialId: string): boolean {
  return groups.some((group) =>
    group.options.some(
      (option) =>
        option.rawMaterialId === rawMaterialId ||
        (option.nestedAdditionalGroups && referencesRawMaterial(option.nestedAdditionalGroups, rawMaterialId)),
    ),
  );
}

// specs/0025-adicionais-reutilizaveis-remocao REQ-3 — grupos de 1º nível nunca aninham
// (`nestedAdditionalGroups` não se aplica a templates), então não precisa descer recursivamente
// como `referencesRawMaterial` — só olhar `additionalGroups` direto.
function referencesTemplate(groups: IProductAdditionalGroup[], templateId: string): boolean {
  return groups.some((group) => group.templateId === templateId);
}

// specs/0041-item-adicional-vinculado-produto REQ-4 — mesmo raciocínio recursivo de
// `referencesRawMaterial` (produto composto pode ter o vínculo em qualquer nível de
// `nestedAdditionalGroups`), só que procurando `linkedProductId` em vez de `rawMaterialId`.
function referencesLinkedProduct(groups: IProductAdditionalGroup[], linkedProductId: string): boolean {
  return groups.some((group) =>
    group.options.some(
      (option) =>
        option.linkedProductId === linkedProductId ||
        (option.nestedAdditionalGroups && referencesLinkedProduct(option.nestedAdditionalGroups, linkedProductId)),
    ),
  );
}

function templateToOptions(template: AdditionalGroupTemplateLeanDocument, groupId: string): IProductAdditionalOption[] {
  return template.options.map((option) => ({
    id: option.id,
    groupId,
    name: option.name,
    priceDelta: option.priceDelta,
    rawMaterialId: option.rawMaterialId,
    linkedProductId: option.linkedProductId,
    imageUrl: option.imageUrl,
  }));
}

// specs/0041-item-adicional-vinculado-produto REQ-3 — "vínculo vivo" igual `resolveGroup`, mas
// pra opções com `linkedProductId`: `name`/`imageUrl` sempre refletem o produto vinculado ATUAL
// (nunca o snapshot persistido na opção). Pura de propósito, mesmo raciocínio de `resolveGroup`.
export function resolveOptionLinkedProduct(
  option: IProductAdditionalOption,
  productsById: Map<string, LinkedProductLeanDocument>,
): IProductAdditionalOption {
  const nestedAdditionalGroups = option.nestedAdditionalGroups?.map((group) => resolveGroupLinkedProducts(group, productsById));
  const linked = option.linkedProductId ? productsById.get(option.linkedProductId) : undefined;
  if (!linked) return nestedAdditionalGroups ? { ...option, nestedAdditionalGroups } : option;
  return { ...option, name: linked.name, imageUrl: linked.imageUrl, nestedAdditionalGroups };
}

function resolveGroupLinkedProducts(
  group: IProductAdditionalGroup,
  productsById: Map<string, LinkedProductLeanDocument>,
): IProductAdditionalGroup {
  return { ...group, options: group.options.map((option) => resolveOptionLinkedProduct(option, productsById)) };
}

// REQ-3 — "vínculo vivo": um grupo com `templateId` sempre reflete os dados ATUAIS do template
// (nunca o que foi persistido no documento do produto, que é só um snapshot congelado de quando
// foi vinculado — ver comentário em `product.entity.ts`). Pura (sem I/O) de propósito — é a única
// peça de lógica desta classe testável sem mocar o Model do Mongoose (convenção deste projeto:
// `.mongoose.repository.ts` não ganha teste unitário próprio, só via repositório mockado nos
// testes de controller — ver `migrate-operator-roles-to-dono.spec.ts` — mas essa regra não cobre
// uma função pura extraída e exportada como esta).
export function resolveGroup(
  group: IProductAdditionalGroup,
  templatesById: Map<string, AdditionalGroupTemplateLeanDocument>,
): IProductAdditionalGroup {
  if (!group.templateId) return group;
  const template = templatesById.get(group.templateId);
  if (!template) return group; // template apagado/não encontrado — mantém o último snapshot conhecido
  return {
    ...group,
    name: template.name,
    type: template.type,
    required: template.required,
    minSelections: template.minSelections,
    maxSelections: template.maxSelections,
    options: templateToOptions(template, group.id),
  };
}

async function resolveTemplates(docs: ProductLeanDocument[]): Promise<void> {
  const templateIds = new Set<string>();
  for (const doc of docs) {
    for (const group of doc.additionalGroups ?? []) {
      if (group.templateId) templateIds.add(group.templateId);
    }
  }
  if (templateIds.size === 0) return;

  const templates = await AdditionalGroupTemplateModel.find({ _id: { $in: [...templateIds] } }).lean<
    AdditionalGroupTemplateLeanDocument[]
  >();
  const templatesById = new Map(templates.map((template) => [template._id, template]));

  for (const doc of docs) {
    doc.additionalGroups = (doc.additionalGroups ?? []).map((group) => resolveGroup(group, templatesById));
  }
}

function collectLinkedProductIds(groups: IProductAdditionalGroup[], acc: Set<string>): void {
  for (const group of groups) {
    for (const option of group.options) {
      if (option.linkedProductId) acc.add(option.linkedProductId);
      if (option.nestedAdditionalGroups) collectLinkedProductIds(option.nestedAdditionalGroups, acc);
    }
  }
}

// specs/0041-item-adicional-vinculado-produto REQ-3 — chamada sempre DEPOIS de `resolveTemplates`
// (nunca antes): um grupo vinculado a template só revela suas opções — e um `linkedProductId`
// eventual dentro delas — depois de resolvido; chamar na ordem contrária deixaria de resolver o
// nome/imagem de opções vindas de template.
async function resolveLinkedProducts(docs: ProductLeanDocument[]): Promise<void> {
  const linkedProductIds = new Set<string>();
  for (const doc of docs) {
    collectLinkedProductIds(doc.additionalGroups ?? [], linkedProductIds);
  }
  if (linkedProductIds.size === 0) return;

  const linkedProducts = await ProductModel.find({ _id: { $in: [...linkedProductIds] } })
    .select('_id name imageUrl')
    .lean<LinkedProductLeanDocument[]>();
  const productsById = new Map(linkedProducts.map((product) => [product._id, product]));

  for (const doc of docs) {
    doc.additionalGroups = (doc.additionalGroups ?? []).map((group) => resolveGroupLinkedProducts(group, productsById));
  }
}

export class ProductMongooseRepository implements IProductRepository {
  async findById(id: string): Promise<IProduct | null> {
    const doc = await ProductModel.findById(id).lean<ProductLeanDocument>();
    if (!doc) return null;
    await resolveTemplates([doc]);
    await resolveLinkedProducts([doc]);
    return toEntity(doc);
  }

  async listByRestaurant(restaurantId: string, filters?: IProductListFilters): Promise<IProduct[]> {
    const query: Record<string, unknown> = { restaurantId };
    if (filters?.name) query.name = { $regex: escapeRegex(filters.name), $options: 'i' };
    if (filters?.isAvailable !== undefined) query.isAvailable = filters.isAvailable;
    const docs = await ProductModel.find(query).lean<ProductLeanDocument[]>();
    await resolveTemplates(docs);
    await resolveLinkedProducts(docs);
    return docs.map(toEntity);
  }

  async create(restaurantId: string, input: NewProductInput): Promise<IProduct> {
    const doc = await ProductModel.create({ restaurantId, ...input });
    return toEntity(doc.toObject() as ProductLeanDocument);
  }

  async update(id: string, input: ProductUpdateInput): Promise<IProduct> {
    const doc = await ProductModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<ProductLeanDocument>();
    return toEntity(doc as ProductLeanDocument);
  }

  async setAvailable(id: string, isAvailable: boolean): Promise<IProduct> {
    const doc = await ProductModel.findByIdAndUpdate(
      id,
      { $set: { isAvailable } },
      { new: true },
    ).lean<ProductLeanDocument>();
    return toEntity(doc as ProductLeanDocument);
  }

  async findActiveByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<IAffectedProduct[]> {
    // Sem query recursiva nativa do Mongo pra árvore de profundidade arbitrária — filtra em
    // memória (catálogo por restaurante é pequeno o suficiente pra isso ser aceitável nesta v1).
    const docs = await ProductModel.find({ restaurantId, isAvailable: true }).lean<ProductLeanDocument[]>();
    return docs
      .filter((doc) => referencesRawMaterial(doc.additionalGroups ?? [], rawMaterialId))
      .map((doc) => ({ id: doc._id, name: doc.name }));
  }

  async findActiveByTemplateId(restaurantId: string, templateId: string): Promise<IAffectedProduct[]> {
    const docs = await ProductModel.find({ restaurantId, isAvailable: true }).lean<ProductLeanDocument[]>();
    return docs
      .filter((doc) => referencesTemplate(doc.additionalGroups ?? [], templateId))
      .map((doc) => ({ id: doc._id, name: doc.name }));
  }

  async remove(id: string): Promise<void> {
    await ProductModel.findByIdAndDelete(id);
  }

  async countAnyByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<number> {
    // Diferente de `findActiveByRawMaterialId` — sem `isAvailable: true`, pra REQ-5 (bloquear
    // exclusão se já foi usado alguma vez, ativo ou não).
    const docs = await ProductModel.find({ restaurantId }).lean<ProductLeanDocument[]>();
    return docs.filter((doc) => referencesRawMaterial(doc.additionalGroups ?? [], rawMaterialId)).length;
  }

  async countAnyByTemplateId(restaurantId: string, templateId: string): Promise<number> {
    const docs = await ProductModel.find({ restaurantId }).lean<ProductLeanDocument[]>();
    return docs.filter((doc) => referencesTemplate(doc.additionalGroups ?? [], templateId)).length;
  }

  /**
   * specs/0028-destaques-vendidos-banners REQ-3 — mesmo padrão de
   * `MenuCategoryMongooseRepository.reorder`: só reatribui `featuredOrder` de produtos que
   * realmente pertencem a este restaurante, ignora ids de fora (isolamento multi-tenant).
   */
  async reorderFeatured(restaurantId: string, orderedIds: string[]): Promise<IProduct[]> {
    const owned = await ProductModel.find({ restaurantId }).select('_id').lean<{ _id: string }[]>();
    const ownedIds = new Set(owned.map((doc) => doc._id));

    await Promise.all(
      orderedIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) => ProductModel.updateOne({ _id: id }, { $set: { featuredOrder: index } })),
    );

    const docs = await ProductModel.find({ restaurantId, isFeatured: true })
      .sort({ featuredOrder: 1 })
      .lean<ProductLeanDocument[]>();
    await resolveTemplates(docs);
    await resolveLinkedProducts(docs);
    return docs.map(toEntity);
  }

  /**
   * specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login — mesma query de
   * `reorderFeatured` (sem a parte de reatribuir `featuredOrder`), mas só produtos
   * **disponíveis** (`reorderFeatured` é retaguarda, mostra tudo pro operador reordenar).
   */
  async getFeatured(restaurantId: string): Promise<IProduct[]> {
    const docs = await ProductModel.find({ restaurantId, isFeatured: true, isAvailable: true })
      .sort({ featuredOrder: 1 })
      .lean<ProductLeanDocument[]>();
    await resolveTemplates(docs);
    await resolveLinkedProducts(docs);
    return docs.map(toEntity);
  }

  async countByMenuCategory(restaurantId: string, menuCategoryId: string): Promise<number> {
    return ProductModel.countDocuments({ restaurantId, menuCategoryId });
  }

  async findAnyByLinkedProductId(restaurantId: string, linkedProductId: string): Promise<IAffectedProduct[]> {
    // Sem `isAvailable: true` — REQ-4 bloqueia a exclusão independente do produto que usa o
    // vínculo estar disponível ou não (mesmo espírito de `countAnyByRawMaterialId`).
    const docs = await ProductModel.find({ restaurantId }).lean<ProductLeanDocument[]>();
    return docs
      .filter((doc) => referencesLinkedProduct(doc.additionalGroups ?? [], linkedProductId))
      .map((doc) => ({ id: doc._id, name: doc.name }));
  }
}
