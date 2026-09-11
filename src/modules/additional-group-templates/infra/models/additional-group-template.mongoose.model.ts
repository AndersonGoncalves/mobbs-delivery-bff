import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const additionalGroupTemplateOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    templateId: { type: String, required: true },
    name: { type: String, required: true },
    priceDelta: { type: Number, required: true },
    rawMaterialId: { type: String },
  },
  { _id: false },
);

const additionalGroupTemplateSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['adicionar', 'remover'], required: true, default: 'adicionar' },
    required: { type: Boolean, required: true },
    minSelections: { type: Number, required: true },
    maxSelections: { type: Number, required: true },
    options: { type: [additionalGroupTemplateOptionSchema], default: [] },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

additionalGroupTemplateSchema.index({ restaurantId: 1 });

// Nome de coleção explícito (singular, docs/architecture/patterns.md §16.6.1).
export const AdditionalGroupTemplateModel = model(
  'AdditionalGroupTemplate',
  additionalGroupTemplateSchema,
  'additionalGroupTemplate',
);
