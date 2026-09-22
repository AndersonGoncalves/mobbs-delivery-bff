import { randomUUID } from 'crypto';

import { IAdditionalGroupTemplate, IAdditionalGroupTemplateOption } from '../../domain/entities/additional-group-template.entity';
import {
  IAdditionalGroupTemplateListFilters,
  IAdditionalGroupTemplateRepository,
  NewAdditionalGroupTemplateInput,
} from '../../domain/repositories/additional-group-template.repository.interface';
import { escapeRegex } from '../../../../shared/utils/escape-regex';
import { ProductModel } from '../../../catalog/infra/models/product.mongoose.model';
import { AdditionalGroupTemplateModel } from '../models/additional-group-template.mongoose.model';

interface AdditionalGroupTemplateLeanDocument extends Omit<IAdditionalGroupTemplate, 'id'> {
  _id: string;
}

interface LinkedProductLeanDocument {
  _id: string;
  name: string;
  imageUrl?: string;
}

function toEntity(doc: AdditionalGroupTemplateLeanDocument): IAdditionalGroupTemplate {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    type: doc.type,
    required: doc.required,
    minSelections: doc.minSelections,
    maxSelections: doc.maxSelections,
    options: doc.options ?? [],
    isActive: doc.isActive,
  };
}

function referencesLinkedProduct(doc: AdditionalGroupTemplateLeanDocument, linkedProductId: string): boolean {
  return (doc.options ?? []).some((option) => option.linkedProductId === linkedProductId);
}

// specs/0041-item-adicional-vinculado-produto REQ-3 — mesmo "vínculo vivo" de
// `ProductMongooseRepository.resolveOptionLinkedProduct`: a retaguarda edita templates
// diretamente, então também precisa ver o nome/imagem ATUAIS do produto vinculado, não um
// snapshot congelado da opção.
async function resolveLinkedProducts(docs: AdditionalGroupTemplateLeanDocument[]): Promise<void> {
  const linkedProductIds = new Set<string>();
  for (const doc of docs) {
    for (const option of doc.options ?? []) {
      if (option.linkedProductId) linkedProductIds.add(option.linkedProductId);
    }
  }
  if (linkedProductIds.size === 0) return;

  const linkedProducts = await ProductModel.find({ _id: { $in: [...linkedProductIds] } })
    .select('_id name imageUrl')
    .lean<LinkedProductLeanDocument[]>();
  const productsById = new Map(linkedProducts.map((product) => [product._id, product]));

  for (const doc of docs) {
    doc.options = (doc.options ?? []).map((option) => {
      const linked = option.linkedProductId ? productsById.get(option.linkedProductId) : undefined;
      return linked ? { ...option, name: linked.name, imageUrl: linked.imageUrl } : option;
    });
  }
}

// Repositório (não o cliente) gera os ids de template/opção — diferente da convenção mais solta
// de `ProductMongooseRepository` (onde `groupId`/`productId` embutidos são o que o cliente
// mandou, sem garantia forte de consistência) — aqui dá pra garantir de verdade porque o
// `templateId` de cada opção só existe depois que o `_id` do template é conhecido.
function buildOptions(templateId: string, options: NewAdditionalGroupTemplateInput['options']): IAdditionalGroupTemplateOption[] {
  return options.map((option) => ({ ...option, id: randomUUID(), templateId }));
}

export class AdditionalGroupTemplateMongooseRepository implements IAdditionalGroupTemplateRepository {
  async listByRestaurant(
    restaurantId: string,
    filters?: IAdditionalGroupTemplateListFilters,
  ): Promise<IAdditionalGroupTemplate[]> {
    const query: Record<string, unknown> = { restaurantId };
    if (filters?.name) query.name = { $regex: escapeRegex(filters.name), $options: 'i' };
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;
    const docs = await AdditionalGroupTemplateModel.find(query).lean<AdditionalGroupTemplateLeanDocument[]>();
    await resolveLinkedProducts(docs);
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IAdditionalGroupTemplate | null> {
    const doc = await AdditionalGroupTemplateModel.findById(id).lean<AdditionalGroupTemplateLeanDocument>();
    if (!doc) return null;
    await resolveLinkedProducts([doc]);
    return toEntity(doc);
  }

  async create(restaurantId: string, input: NewAdditionalGroupTemplateInput): Promise<IAdditionalGroupTemplate> {
    const id = randomUUID();
    const doc = await AdditionalGroupTemplateModel.create({
      _id: id,
      restaurantId,
      name: input.name,
      type: input.type,
      required: input.required,
      minSelections: input.minSelections,
      maxSelections: input.maxSelections,
      options: buildOptions(id, input.options),
      isActive: true,
      imageUrl: input.imageUrl,
    });
    return toEntity(doc.toObject() as AdditionalGroupTemplateLeanDocument);
  }

  async update(id: string, input: NewAdditionalGroupTemplateInput): Promise<IAdditionalGroupTemplate> {
    const doc = await AdditionalGroupTemplateModel.findByIdAndUpdate(
      id,
      {
        $set: {
          name: input.name,
          type: input.type,
          required: input.required,
          minSelections: input.minSelections,
          maxSelections: input.maxSelections,
          options: buildOptions(id, input.options),
          imageUrl: input.imageUrl,
        },
      },
      { new: true },
    ).lean<AdditionalGroupTemplateLeanDocument>();
    return toEntity(doc as AdditionalGroupTemplateLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IAdditionalGroupTemplate> {
    const doc = await AdditionalGroupTemplateModel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true },
    ).lean<AdditionalGroupTemplateLeanDocument>();
    return toEntity(doc as AdditionalGroupTemplateLeanDocument);
  }

  async remove(id: string): Promise<void> {
    await AdditionalGroupTemplateModel.findByIdAndDelete(id);
  }

  async findAnyByLinkedProductId(restaurantId: string, linkedProductId: string): Promise<{ id: string; name: string }[]> {
    const docs = await AdditionalGroupTemplateModel.find({ restaurantId }).lean<AdditionalGroupTemplateLeanDocument[]>();
    return docs.filter((doc) => referencesLinkedProduct(doc, linkedProductId)).map((doc) => ({ id: doc._id, name: doc.name }));
  }
}
