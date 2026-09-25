import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const businessHoursSchema = new Schema(
  {
    dayOfWeek: {
      type: String,
      required: true,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    isClosed: { type: Boolean, required: true },
    openTime: { type: String },
    closeTime: { type: String },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    street: { type: String, required: true },
    number: { type: String, required: true },
    complement: { type: String },
    neighborhood: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
  },
  { _id: false },
);

// specs/0028-destaques-vendidos-banners REQ-5.
const bannerSchema = new Schema(
  {
    id: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkType: { type: String, enum: ['product', 'category', 'externalUrl', 'none'], required: true },
    productId: { type: String },
    menuCategoryId: { type: String },
    externalUrl: { type: String },
  },
  { _id: false },
);

// specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10.
const deliveryFeeZoneSchema = new Schema(
  {
    id: { type: String, required: true },
    neighborhood: { type: String, required: true },
    feeCents: { type: Number, required: true },
  },
  { _id: false },
);

const restaurantSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
    logoUrl: { type: String },
    primaryColor: { type: String },
    onPrimaryColor: { type: String },
    defaultProductImageUrl: { type: String },
    businessHours: { type: [businessHoursSchema], default: [] },
    address: { type: addressSchema },
    phone: { type: String },
    document: { type: String },
    minimumOrderValue: { type: Number, required: true, default: 0 },
    deliveryFeeCents: { type: Number, required: true, default: 0 },
    shareMessage: { type: String },
    pixKey: { type: String },
    pixKeyType: { type: String, enum: ['telefone', 'cpf', 'cnpj', 'email', 'aleatoria'] },
    pixBeneficiaryName: { type: String },
    whatsappConnected: { type: Boolean, required: true, default: false },
    productImageOnRight: { type: Boolean, required: true, default: true },
    // specs/0028-destaques-vendidos-banners REQ-1, REQ-4, REQ-5, REQ-10.
    showBestSellers: { type: Boolean, required: true, default: false },
    bestSellersCount: { type: Number, required: true, default: 6 },
    showHighlights: { type: Boolean, required: true, default: true },
    showBanners: { type: Boolean, required: true, default: true },
    banners: { type: [bannerSchema], default: [] },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2.
    allowCustomerCancelOrder: { type: Boolean, required: true, default: true },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10; 'free' adicionado em
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1.
    deliveryFeeMode: { type: String, enum: ['fixed', 'byNeighborhood', 'free'], required: true, default: 'fixed' },
    deliveryFeeZones: { type: [deliveryFeeZoneSchema], default: [] },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-9.
    instagramUrl: { type: String },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6.
    rating: { type: Number, required: true, default: 0 },
    ratingCount: { type: Number, required: true, default: 0 },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1.
    showHighlightsInMultipleRows: { type: Boolean, required: true, default: false },
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — sem default de
    // propósito: ausente = seção "Peça também" não aparece no app (ver comentário na entity).
    cartSuggestionsCount: { type: Number, required: false },
    // specs/0039-onboarding-primeiro-acesso REQ-8/REQ-9 — tipo de negócio escolhido no
    // autocadastro (ex. "pizzaria"), usado só pra decidir o catálogo inicial na hora da criação;
    // não editável depois pela retaguarda.
    category: { type: String },
    // specs/0039-onboarding-primeiro-acesso REQ-4 — marca a última vez que o operador salvou de
    // verdade a tela de horário de funcionamento (não só o default automático do autocadastro).
    // `null`/ausente = nunca revisado desde a criação.
    businessHoursReviewedAt: { type: Date },
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — default as 5 formas
    // (mesmo raciocínio de `RestaurantSignupController` passar explicitamente no create, mas
    // como default de schema cobre também qualquer outro caminho de criação).
    acceptedPaymentMethods: {
      type: [String],
      enum: ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'],
      default: ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'],
    },
    // specs/0062-confirmar-pedido-whatsapp-restaurante.
    notifyRestaurantOnNewOrder: { type: Boolean, required: true, default: true },
    newOrderRestaurantWhatsAppTemplate: { type: String },
    // specs/0063-notificacao-whatsapp-pedido-confirmado.
    notifyCustomerOnOrderConfirmed: { type: Boolean, required: true, default: true },
    orderConfirmedWhatsAppTemplate: { type: String },
    // specs/0064-notificacao-whatsapp-pix-confirmado.
    notifyCustomerOnPixConfirmed: { type: Boolean, required: true, default: true },
    pixConfirmedWhatsAppTemplate: { type: String },
    // specs/0069.
    notifyCustomerOnOrderCreated: { type: Boolean, required: true, default: true },
    orderReceiptWhatsAppTemplate: { type: String },
    // specs/0065.
    notifyCustomerOnOrderOutForDelivery: { type: Boolean, required: true, default: true },
    orderOutForDeliveryWhatsAppTemplate: { type: String },
    // specs/0071.
    notifyCustomerOnOrderPreparing: { type: Boolean, required: true, default: true },
    orderPreparingWhatsAppTemplate: { type: String },
    notifyCustomerOnOrderCancelled: { type: Boolean, required: true, default: true },
    orderCancelledWhatsAppTemplate: { type: String },
  },
  { _id: false, timestamps: true },
);

restaurantSchema.index({ slug: 1 }, { unique: true });

// Nome da coleção explícito (singular, camelCase, docs/architecture/patterns.md §16.6.1) — sem o
// terceiro argumento, o Mongoose pluralizaria sozinho para "restaurants", quebrando a convenção
// (achado rodando o BFF de verdade contra um Mongo real: a busca por slug sempre voltava 404,
// porque estava sendo escrita/lida em coleções com nomes diferentes).
export const RestaurantModel = model('Restaurant', restaurantSchema, 'restaurant');
