import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

// Recursivo (produtos compostos, arquétipo 4 — docs/architecture/data-model.md, "Produtos
// compostos") — `productAdditionalGroupSchema` referencia a si mesma via
// `nestedAdditionalGroups` dentro de `productAdditionalOptionSchema`. Mongoose só aceita a
// referência circular declarando o schema primeiro e usando `.add()` depois.
const productAdditionalOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    groupId: { type: String, required: true },
    name: { type: String, required: true },
    priceDelta: { type: Number, required: true },
    rawMaterialId: { type: String },
  },
  { _id: false },
);

const productAdditionalGroupSchema = new Schema(
  {
    id: { type: String, required: true },
    productId: { type: String, required: true },
    // specs/0025-adicionais-reutilizaveis-remocao REQ-2/REQ-3 — presente = grupo vinculado a um
    // AdditionalGroupTemplate, resolvido na leitura (ProductMongooseRepository). Quando vinculado,
    // o cliente manda só {id, productId, templateId} (`productAdditionalGroupReferenceSchema`) —
    // por isso os 4 campos abaixo NÃO são `required` aqui (diferente do zod, que exige tudo no
    // grupo inline): salvos como snapshot/rede-de-segurança, sempre sobrescritos na leitura.
    templateId: { type: String },
    name: { type: String, default: '' },
    type: { type: String, enum: ['adicionar', 'remover'], required: true, default: 'adicionar' },
    required: { type: Boolean, default: false },
    minSelections: { type: Number, default: 0 },
    maxSelections: { type: Number, default: 0 },
    options: { type: [productAdditionalOptionSchema], default: [] },
  },
  { _id: false },
);

productAdditionalOptionSchema.add({
  nestedAdditionalGroups: { type: [productAdditionalGroupSchema], default: [] },
});

const productSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    menuCategoryId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    price: { type: Number, required: true },
    isAvailable: { type: Boolean, required: true, default: true },
    additionalGroups: { type: [productAdditionalGroupSchema], default: [] },
  },
  { _id: false, timestamps: true },
);

productSchema.index({ restaurantId: 1, menuCategoryId: 1 });

// Nome de coleção explícito (singular, docs/architecture/patterns.md §16.6.1).
export const ProductModel = model('Product', productSchema, 'product');
