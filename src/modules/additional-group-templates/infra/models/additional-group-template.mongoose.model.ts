import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const additionalGroupTemplateOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    templateId: { type: String, required: true },
    name: { type: String, required: true },
    // specs/0044-promocoes-produtos (follow-up) — não `required`: ausente quando a opção tem
    // `linkedProductId` (preço resolvido "ao vivo" do produto vinculado, nunca armazenado).
    priceDelta: { type: Number },
    rawMaterialId: { type: String },
    // specs/0041-item-adicional-vinculado-produto.
    linkedProductId: { type: String },
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3.
    imageUrl: { type: String },
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
