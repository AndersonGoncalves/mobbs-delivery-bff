import { randomUUID } from 'crypto';

import { IAdditionalGroupTemplate, IAdditionalGroupTemplateOption } from '../../domain/entities/additional-group-template.entity';
import {
  IAdditionalGroupTemplateListFilters,
  IAdditionalGroupTemplateRepository,
  NewAdditionalGroupTemplateInput,
} from '../../domain/repositories/additional-group-template.repository.interface';
import { escapeRegex } from '../../../../shared/utils/escape-regex';
import { AdditionalGroupTemplateModel } from '../models/additional-group-template.mongoose.model';

interface AdditionalGroupTemplateLeanDocument extends Omit<IAdditionalGroupTemplate, 'id'> {
  _id: string;
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
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IAdditionalGroupTemplate | null> {
    const doc = await AdditionalGroupTemplateModel.findById(id).lean<AdditionalGroupTemplateLeanDocument>();
    return doc ? toEntity(doc) : null;
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
}
