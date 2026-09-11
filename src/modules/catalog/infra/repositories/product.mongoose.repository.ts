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
  options: { id: string; name: string; priceDelta: number; rawMaterialId?: string }[];
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

function templateToOptions(template: AdditionalGroupTemplateLeanDocument, groupId: string): IProductAdditionalOption[] {
  return template.options.map((option) => ({
    id: option.id,
    groupId,
    name: option.name,
    priceDelta: option.priceDelta,
    rawMaterialId: option.rawMaterialId,
  }));
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

export class ProductMongooseRepository implements IProductRepository {
  async findById(id: string): Promise<IProduct | null> {
    const doc = await ProductModel.findById(id).lean<ProductLeanDocument>();
    if (!doc) return null;
    await resolveTemplates([doc]);
    return toEntity(doc);
  }

  async listByRestaurant(restaurantId: string, filters?: IProductListFilters): Promise<IProduct[]> {
    const query: Record<string, unknown> = { restaurantId };
    if (filters?.name) query.name = { $regex: escapeRegex(filters.name), $options: 'i' };
    if (filters?.isAvailable !== undefined) query.isAvailable = filters.isAvailable;
    const docs = await ProductModel.find(query).lean<ProductLeanDocument[]>();
    await resolveTemplates(docs);
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
}
