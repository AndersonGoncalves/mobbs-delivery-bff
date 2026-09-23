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
    // specs/0044-promocoes-produtos (follow-up) — não `required`: ausente quando a opção tem
    // `linkedProductId` (preço resolvido "ao vivo" do produto vinculado, nunca armazenado; XOR
    // validado no zod).
    priceDelta: { type: Number },
    rawMaterialId: { type: String },
    // specs/0041-item-adicional-vinculado-produto — referência opcional a outro Product
    // (mutuamente exclusiva com rawMaterialId, validado no zod); name/imageUrl/priceDelta são
    // sobrescritos na leitura a partir do produto vinculado, mesmo raciocínio de templateId abaixo.
    linkedProductId: { type: String },
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — corrige a foto que
    // estava no grupo (spec 0029): opção vinda de grupo vinculado sobrescreve na leitura, então
    // nunca `required` aqui (mesmo raciocínio já usado pros campos do grupo abaixo).
    imageUrl: { type: String },
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
    // specs/0028-destaques-vendidos-banners REQ-3.
    isFeatured: { type: Boolean, required: true, default: false },
    featuredOrder: { type: Number, required: true, default: 0 },
    // specs/0041-item-adicional-vinculado-produto REQ-1.
    availableAsAdditional: { type: Boolean, required: true, default: false },
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — ausente = feito sob
    // demanda, sem controle de estoque (nunca `default`, propositalmente).
    stockQuantity: { type: Number },
  },
  { _id: false, timestamps: true },
);

productSchema.index({ restaurantId: 1, menuCategoryId: 1 });

// Nome de coleção explícito (singular, docs/architecture/patterns.md §16.6.1).
export const ProductModel = model('Product', productSchema, 'product');
