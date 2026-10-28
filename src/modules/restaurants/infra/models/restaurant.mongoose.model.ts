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

// Pedido explícito do usuário (follow-up specs/0101) — dados comerciais submetidos na criação
// da subconta Asaas, guardados pra reexibir no formulário (desabilitado) depois de vinculado.
const asaasSubaccountDataSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    cpfCnpj: { type: String, required: true },
    birthDate: { type: String, required: true },
    mobilePhone: { type: String, required: true },
    incomeValue: { type: Number, required: true },
    address: { type: String, required: true },
    addressNumber: { type: String, required: true },
    province: { type: String, required: true },
    postalCode: { type: String, required: true },
  },
  { _id: false },
);

// Pedido explícito do usuário (follow-up) — snapshot completo de uma subconta "esquecida"
// (ver `IPreviousAsaasSubaccount`); guarda a chave de API já emitida, única forma de voltar a
// usar essa subconta depois (o Asaas não tem endpoint de exclusão).
const previousAsaasSubaccountSchema = new Schema(
  {
    asaasAccountId: { type: String, required: true },
    asaasWalletId: { type: String, required: true },
    asaasApiKey: { type: String, required: true },
    asaasWebhookToken: { type: String, required: true },
    subaccountData: { type: asaasSubaccountDataSchema, required: true },
    archivedAt: { type: String, required: true },
  },
  { _id: false },
);

// specs/0028-destaques-vendidos-banners REQ-5.
const bannerSchema = new Schema(
  {
    id: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkType: { type: String, enum: ['product', 'category', 'externalUrl', 'highlights', 'bestSellers', 'none'], required: true },
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
    stockControlEnabled: { type: Boolean, required: true, default: false },
    // specs/0131-cashback-app REQ-1 / specs/0132-programa-fidelidade-app REQ-1.
    cashbackPercent: { type: Number },
    loyaltyGoalOrders: { type: Number },
    loyaltyRewardValue: { type: Number },
    // specs/0192-ajustes-banner-fidelidade-pix-asaas REQ-4.
    loyaltyMinOrderValue: { type: Number },
    deliveryFeeCents: { type: Number, required: true, default: 0 },
    shareMessage: { type: String },
    // specs/0094-mensagem-boas-vindas-home — sem default: ausente/vazio = nenhum card na home.
    welcomeMessage: { type: String },
    welcomeCardColor: { type: String },
    // specs/0043-programa-indicacao REQ-1 — sparse: restaurantes antigos ficam sem código até o backfill.
    referralCode: { type: String, unique: true, sparse: true },
    pixKey: { type: String },
    pixKeyType: { type: String, enum: ['telefone', 'cpf', 'cnpj', 'email', 'aleatoria'] },
    pixBeneficiaryName: { type: String },
    whatsappConnected: { type: Boolean, required: true, default: false },
    productImageOnRight: { type: Boolean, required: true, default: true },
    // toggle visual análogo a productImageOnRight: fundo branco fixo (true) vs. tom calculado
    // a partir de primaryColor (false, default).
    useWhiteBackground: { type: Boolean, required: true, default: false },
    // Pedido explícito do usuário — default `true` (branco fixo) preserva o comportamento visual
    // de antes deste campo existir.
    useWhiteBottomNavBar: { type: Boolean, required: true, default: true },
    // Pedido explícito do usuário (3º follow-up) — `statusBarColorMode` (2º follow-up) removido
    // daqui: a barra de status não é mais escolhível à parte, sempre segue useWhiteBackground.
    // Restaurantes que já salvaram um valor antigo (campo fora do schema) simplesmente o ignoram.
    // Pedido explícito do usuário (2º follow-up) — mesmo raciocínio de useWhiteBackground, pro
    // preenchimento dos campos de texto (`AppTextField`) e da caixa de busca da home
    // (`AppSearchField`) do app cliente. Default `false` em ambos preserva o comportamento visual
    // que cada um já tinha antes destes campos existirem (tema/cinza, respectivamente).
    useWhiteTextFieldColor: { type: Boolean, required: true, default: false },
    useWhiteSearchFieldColor: { type: Boolean, required: true, default: false },
    // specs/0028-destaques-vendidos-banners REQ-1, REQ-4, REQ-5, REQ-10.
    showBestSellers: { type: Boolean, required: true, default: false },
    showHighlights: { type: Boolean, required: true, default: true },
    showBanners: { type: Boolean, required: true, default: true },
    showReorderTag: { type: Boolean, default: true },
    showMostPurchasedTag: { type: Boolean, default: true },
    // specs/0042 — cobrança por faixa de faturamento; ausente até o primeiro cálculo.
    billing: {
      type: new Schema(
        {
          referenceMonth: { type: String, required: true },
          currentTier: { type: String, enum: ['free', 'pro', 'premium'], required: true },
          notified75Percent: { type: Boolean, default: false },
          notifiedTierUpgrade: { type: Boolean, default: false },
          status: { type: String, enum: ['ok', 'blocked'], default: 'ok' },
          cycle: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
        },
        { _id: false },
      ),
      default: undefined,
    },
    banners: { type: [bannerSchema], default: [] },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2.
    allowCustomerCancelOrder: { type: Boolean, required: true, default: true },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10; 'free' adicionado em
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1.
    deliveryFeeMode: { type: String, enum: ['fixed', 'byNeighborhood', 'free'], required: true, default: 'fixed' },
    deliveryFeeZones: { type: [deliveryFeeZoneSchema], default: [] },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-9.
    instagramUrl: { type: String },
    // specs/0118-controle-caixa-automatico-redes-sociais REQ-7/REQ-8.
    facebookUrl: { type: String },
    // specs/0118-controle-caixa-automatico-redes-sociais REQ-1 — default 'manual' preserva o
    // comportamento atual de todo restaurante já existente.
    cashRegisterMode: { type: String, enum: ['manual', 'automatic'], required: true, default: 'manual' },
    // Pedido explícito do usuário — default desligado preserva o comportamento atual (sem
    // nenhuma restrição) de todo restaurante já existente.
    customerBlockingEnabled: { type: Boolean, required: true, default: false },
    // specs/0139-impressao-automatica-bridge REQ-5/REQ-6 — default desligado preserva o
    // comportamento atual (sem bridge nenhum) de todo restaurante já existente.
    autoPrintEnabled: { type: Boolean, required: true, default: false },
    autoPrintIntervalSeconds: { type: Number, required: true, default: 10, min: 5, max: 120 },
    autoPrintApiKey: { type: String },
    // specs/0156-filtro-idade-impressao-automatica REQ-1/REQ-2 — default 5 min preserva um corte
    // razoável pra todo restaurante já existente sem precisar configurar nada.
    autoPrintMaxAgeMinutes: { type: Number, default: 5, min: 1, max: 60 },
    // specs/0155-app-totem-autoatendimento REQ-22 — default desligado/sem formas preserva o
    // comportamento atual (sem totem nenhum) de todo restaurante já existente.
    totemEnabled: { type: Boolean, required: true, default: false },
    // REQ-11/"Fora de escopo" do spec.md — restrito a dinheiro e Pix nesta v1 (defesa em
    // profundidade também no schema, não só na validação do controller).
    totemPaymentMethods: { type: [String], enum: ['pix', 'cash'], default: [] },
    totemApiKey: { type: String },
    // specs/0140-confirmacao-automatica-pix REQ-1b.
    paymentWebhookApiKey: { type: String },
    // specs/0101-integracao-asaas (fase 1) — default desligado preserva o comportamento atual
    // (Pix com chave direta, sem gateway) de todo restaurante já existente.
    onlinePaymentsEnabled: { type: Boolean, required: true, default: false },
    asaasAccountId: { type: String },
    asaasWalletId: { type: String },
    asaasApiKey: { type: String },
    asaasWebhookToken: { type: String },
    asaasSubaccountData: { type: asaasSubaccountDataSchema },
    previousAsaasSubaccounts: { type: [previousAsaasSubaccountSchema], default: [] },
    // specs/0101-integracao-asaas (fase 2).
    asaasCheckoutWebhookRegistered: { type: Boolean, default: false },
    // specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10 — chave Pix de destino do repasse.
    asaasTransferPixKey: { type: String },
    asaasTransferPixKeyType: { type: String, enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'] },
    // specs/0170-integracao-mercado-pago — vínculo OAuth (não subconta/KYC como o Asaas acima).
    mercadoPagoAccessToken: { type: String },
    mercadoPagoRefreshToken: { type: String },
    mercadoPagoUserId: { type: String },
    mercadoPagoTokenExpiresAt: { type: String },
    // Pedido explícito do usuário (follow-up) — vínculo OAuth do Instagram, mesmo modelo acima.
    instagramAccessToken: { type: String },
    instagramAccountId: { type: String },
    instagramPageId: { type: String },
    instagramUsername: { type: String },
    // specs/0090-integracao-ifood — credenciais digitadas pelo operador (não OAuth redirect).
    ifoodMerchantId: { type: String },
    ifoodClientId: { type: String },
    ifoodClientSecret: { type: String },
    ifoodConnectedAt: { type: String },
    // Pedido explícito do usuário — tempo médio de atendimento mostrado no app do cliente, por
    // modalidade; defaults vindos do exemplo mostrado (40-60min delivery, 20-40min balcão).
    deliveryTimeMinMinutes: { type: Number, required: true, default: 40 },
    deliveryTimeMaxMinutes: { type: Number, required: true, default: 60 },
    pickupTimeMinMinutes: { type: Number, required: true, default: 20 },
    pickupTimeMaxMinutes: { type: Number, required: true, default: 40 },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6.
    rating: { type: Number, required: true, default: 0 },
    ratingCount: { type: Number, required: true, default: 0 },
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1.
    showHighlightsInMultipleRows: { type: Boolean, required: true, default: false },
    showBestSellersInMultipleRows: { type: Boolean, required: true, default: false },
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — mesmo padrão de
    // `showBestSellers` desde specs/0117 (ver comentário na entity).
    showCartSuggestions: { type: Boolean, required: true, default: false },
    // specs/0039-onboarding-primeiro-acesso REQ-8/REQ-9 — tipo de negócio escolhido no
    // autocadastro (ex. "pizzaria"), usado só pra decidir o catálogo inicial na hora da criação;
    // não editável depois pela retaguarda.
    category: { type: String },
    // specs/0039-onboarding-primeiro-acesso REQ-4 — marca a última vez que o operador salvou de
    // verdade a tela de horário de funcionamento (não só o default automático do autocadastro).
    // `null`/ausente = nunca revisado desde a criação.
    businessHoursReviewedAt: { type: Date },
    // specs/0185 — itens opcionais do checklist de onboarding já visitados (compartilhado entre operadores).
    onboardingVisitedItems: { type: [String], default: [] },
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — default (mesmo raciocínio
    // de `RestaurantSignupController` passar explicitamente no create, mas como default de schema
    // cobre também qualquer outro caminho de criação). Pedido explícito do usuário — `bankTransfer`
    // removido de todo o app (saiu do `enum`).
    acceptedPaymentMethods: {
      type: [String],
      // specs/0170-integracao-mercado-pago — `creditCardOnline` no enum (validação), nunca no
      // `default` (nenhum restaurante "aceita" cobrança online sem antes vincular um gateway,
      // `Restaurant.mercadoPagoAccessToken`/`asaasApiKey` — ver `OrdersController.create`).
      enum: ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'],
      default: ['creditCard', 'debitCard', 'pix', 'cash'],
    },
    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-1 — default vazio (opt-in
    // explícito, preserva o comportamento de hoje pra quem nunca configurar nada).
    autoConfirmPaymentMethods: {
      type: [String],
      enum: ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'],
      default: [],
    },
    // specs/0083-modalidade-entrega-retirada-restaurante REQ-1 — default "ambos" (retrocompatível).
    orderTypes: {
      type: [String],
      enum: ['delivery', 'pickup'],
      default: ['delivery', 'pickup'],
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
    notifyCustomerOnOrderReadyForPickup: { type: Boolean, required: true, default: true },
    orderOutForDeliveryWhatsAppTemplate: { type: String },
    orderReadyForPickupWhatsAppTemplate: { type: String },
    // specs/0071.
    notifyCustomerOnOrderPreparing: { type: Boolean, required: true, default: true },
    orderPreparingWhatsAppTemplate: { type: String },
    notifyCustomerOnOrderCancelled: { type: Boolean, required: true, default: true },
    orderCancelledWhatsAppTemplate: { type: String },
    // specs/0086-mensagens-whatsapp-pedido-entregue-pagamento-confirmado.
    notifyCustomerOnOrderDelivered: { type: Boolean, required: true, default: true },
    orderDeliveredWhatsAppTemplate: { type: String },
  },
  { _id: false, timestamps: true },
);

restaurantSchema.index({ slug: 1 }, { unique: true });

// Nome da coleção explícito (singular, camelCase, docs/architecture/patterns.md §16.6.1) — sem o
// terceiro argumento, o Mongoose pluralizaria sozinho para "restaurants", quebrando a convenção
// (achado rodando o BFF de verdade contra um Mongo real: a busca por slug sempre voltava 404,
// porque estava sendo escrita/lida em coleções com nomes diferentes).
export const RestaurantModel = model('Restaurant', restaurantSchema, 'restaurant');
