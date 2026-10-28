import { randomBytes } from 'crypto';
import { buildDefaultShareMessage } from '../../domain/default-share-message';
import { OrderType, PaymentMethod } from '../../../orders/domain/entities/order.entity';
import {
  CashRegisterMode,
  DeliveryFeeMode,
  IAsaasSubaccountData,
  IBusinessHours,
  IDeliveryFeeZone,
  IPreviousAsaasSubaccount,
  IRestaurant,
  IRestaurantAddress,
  IRestaurantBilling,
  IRestaurantBanner,
  PixKeyType,
} from '../../domain/entities/restaurant.entity';
import {
  IRestaurantRepository,
  RestaurantProfileUpdate,
} from '../../domain/repositories/restaurant.repository.interface';
import { RestaurantModel } from '../models/restaurant.mongoose.model';

interface RestaurantLeanDocument {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl?: string;
  primaryColor?: string;
  onPrimaryColor?: string;
  defaultProductImageUrl?: string;
  businessHours?: IBusinessHours[];
  address?: IRestaurantAddress;
  phone?: string;
  document?: string;
  minimumOrderValue?: number;
  stockControlEnabled?: boolean;
  cashbackPercent?: number;
  loyaltyGoalOrders?: number;
  loyaltyRewardValue?: number;
  loyaltyMinOrderValue?: number;
  deliveryFeeCents?: number;
  shareMessage?: string;
  welcomeMessage?: string;
  welcomeCardColor?: string;
  referralCode?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
  whatsappConnected?: boolean;
  productImageOnRight?: boolean;
  useWhiteBackground?: boolean;
  useWhiteBottomNavBar?: boolean;
  useWhiteTextFieldColor?: boolean;
  useWhiteSearchFieldColor?: boolean;
  showBestSellers?: boolean;
  showHighlights?: boolean;
  showBanners?: boolean;
  showReorderTag?: boolean;
  showMostPurchasedTag?: boolean;
  banners?: IRestaurantBanner[];
  allowCustomerCancelOrder?: boolean;
  deliveryFeeMode?: DeliveryFeeMode;
  deliveryFeeZones?: IDeliveryFeeZone[];
  billing?: IRestaurantBilling;
  instagramUrl?: string;
  deliveryTimeMinMinutes?: number;
  deliveryTimeMaxMinutes?: number;
  pickupTimeMinMinutes?: number;
  pickupTimeMaxMinutes?: number;
  rating?: number;
  ratingCount?: number;
  showHighlightsInMultipleRows?: boolean;
  showBestSellersInMultipleRows?: boolean;
  showCartSuggestions?: boolean;
  category?: string;
  businessHoursReviewedAt?: Date;
  onboardingVisitedItems?: string[];
  acceptedPaymentMethods?: PaymentMethod[];
  autoConfirmPaymentMethods?: PaymentMethod[];
  orderTypes?: OrderType[];
  notifyRestaurantOnNewOrder?: boolean;
  newOrderRestaurantWhatsAppTemplate?: string;
  notifyCustomerOnOrderConfirmed?: boolean;
  orderConfirmedWhatsAppTemplate?: string;
  notifyCustomerOnPixConfirmed?: boolean;
  pixConfirmedWhatsAppTemplate?: string;
  notifyCustomerOnOrderCreated?: boolean;
  orderReceiptWhatsAppTemplate?: string;
  notifyCustomerOnOrderOutForDelivery?: boolean;
  notifyCustomerOnOrderReadyForPickup?: boolean;
  orderOutForDeliveryWhatsAppTemplate?: string;
  orderReadyForPickupWhatsAppTemplate?: string;
  notifyCustomerOnOrderPreparing?: boolean;
  orderPreparingWhatsAppTemplate?: string;
  notifyCustomerOnOrderCancelled?: boolean;
  orderCancelledWhatsAppTemplate?: string;
  notifyCustomerOnOrderDelivered?: boolean;
  orderDeliveredWhatsAppTemplate?: string;
  facebookUrl?: string;
  cashRegisterMode?: CashRegisterMode;
  customerBlockingEnabled?: boolean;
  autoPrintEnabled?: boolean;
  autoPrintIntervalSeconds?: number;
  autoPrintMaxAgeMinutes?: number;
  autoPrintApiKey?: string;
  totemEnabled?: boolean;
  totemPaymentMethods?: PaymentMethod[];
  totemApiKey?: string;
  paymentWebhookApiKey?: string;
  onlinePaymentsEnabled?: boolean;
  asaasAccountId?: string;
  asaasWalletId?: string;
  asaasApiKey?: string;
  asaasWebhookToken?: string;
  asaasSubaccountData?: IAsaasSubaccountData;
  previousAsaasSubaccounts?: IPreviousAsaasSubaccount[];
  asaasCheckoutWebhookRegistered?: boolean;
  mercadoPagoAccessToken?: string;
  mercadoPagoRefreshToken?: string;
  mercadoPagoUserId?: string;
  mercadoPagoTokenExpiresAt?: string;
  instagramAccessToken?: string;
  instagramAccountId?: string;
  instagramPageId?: string;
  instagramUsername?: string;
  ifoodMerchantId?: string;
  ifoodClientId?: string;
  ifoodClientSecret?: string;
  ifoodConnectedAt?: string;
}

const ALL_PAYMENT_METHODS: PaymentMethod[] = ['creditCard', 'debitCard', 'pix', 'cash'];

function toEntity(doc: RestaurantLeanDocument): IRestaurant {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    isActive: doc.isActive,
    logoUrl: doc.logoUrl,
    primaryColor: doc.primaryColor,
    onPrimaryColor: doc.onPrimaryColor,
    defaultProductImageUrl: doc.defaultProductImageUrl,
    businessHours: doc.businessHours ?? [],
    address: doc.address,
    phone: doc.phone,
    document: doc.document,
    minimumOrderValue: doc.minimumOrderValue ?? 0,
    stockControlEnabled: doc.stockControlEnabled ?? false,
    cashbackPercent: doc.cashbackPercent,
    loyaltyGoalOrders: doc.loyaltyGoalOrders,
    loyaltyRewardValue: doc.loyaltyRewardValue,
    loyaltyMinOrderValue: doc.loyaltyMinOrderValue,
    deliveryFeeCents: doc.deliveryFeeCents ?? 0,
    shareMessage: doc.shareMessage ?? buildDefaultShareMessage(doc.name),
    welcomeMessage: doc.welcomeMessage,
    welcomeCardColor: doc.welcomeCardColor,
    referralCode: doc.referralCode,
    pixKey: doc.pixKey,
    pixKeyType: doc.pixKeyType,
    pixBeneficiaryName: doc.pixBeneficiaryName,
    whatsappConnected: doc.whatsappConnected ?? false,
    productImageOnRight: doc.productImageOnRight ?? true,
    useWhiteBackground: doc.useWhiteBackground ?? false,
    useWhiteBottomNavBar: doc.useWhiteBottomNavBar ?? true,
    useWhiteTextFieldColor: doc.useWhiteTextFieldColor ?? false,
    useWhiteSearchFieldColor: doc.useWhiteSearchFieldColor ?? false,
    showBestSellers: doc.showBestSellers ?? false,
    showHighlights: doc.showHighlights ?? true,
    showBanners: doc.showBanners ?? true,
    showReorderTag: doc.showReorderTag ?? true,
    showMostPurchasedTag: doc.showMostPurchasedTag ?? true,
    banners: doc.banners ?? [],
    allowCustomerCancelOrder: doc.allowCustomerCancelOrder ?? true,
    deliveryFeeMode: doc.deliveryFeeMode ?? 'fixed',
    deliveryFeeZones: doc.deliveryFeeZones ?? [],
    billing: doc.billing ?? undefined,
    instagramUrl: doc.instagramUrl,
    deliveryTimeMinMinutes: doc.deliveryTimeMinMinutes ?? 40,
    deliveryTimeMaxMinutes: doc.deliveryTimeMaxMinutes ?? 60,
    pickupTimeMinMinutes: doc.pickupTimeMinMinutes ?? 20,
    pickupTimeMaxMinutes: doc.pickupTimeMaxMinutes ?? 40,
    rating: doc.rating ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    showHighlightsInMultipleRows: doc.showHighlightsInMultipleRows ?? false,
    showBestSellersInMultipleRows: doc.showBestSellersInMultipleRows ?? false,
    showCartSuggestions: doc.showCartSuggestions ?? false,
    category: doc.category,
    businessHoursReviewedAt: doc.businessHoursReviewedAt,
    onboardingVisitedItems: doc.onboardingVisitedItems ?? [],
    acceptedPaymentMethods: doc.acceptedPaymentMethods ?? ALL_PAYMENT_METHODS,
    autoConfirmPaymentMethods: doc.autoConfirmPaymentMethods ?? [],
    orderTypes: doc.orderTypes?.length ? doc.orderTypes : ['delivery', 'pickup'],
    notifyRestaurantOnNewOrder: doc.notifyRestaurantOnNewOrder ?? true,
    newOrderRestaurantWhatsAppTemplate: doc.newOrderRestaurantWhatsAppTemplate,
    notifyCustomerOnOrderConfirmed: doc.notifyCustomerOnOrderConfirmed ?? true,
    orderConfirmedWhatsAppTemplate: doc.orderConfirmedWhatsAppTemplate,
    notifyCustomerOnPixConfirmed: doc.notifyCustomerOnPixConfirmed ?? true,
    pixConfirmedWhatsAppTemplate: doc.pixConfirmedWhatsAppTemplate,
    notifyCustomerOnOrderCreated: doc.notifyCustomerOnOrderCreated ?? true,
    orderReceiptWhatsAppTemplate: doc.orderReceiptWhatsAppTemplate,
    notifyCustomerOnOrderOutForDelivery: doc.notifyCustomerOnOrderOutForDelivery ?? true,
    notifyCustomerOnOrderReadyForPickup: doc.notifyCustomerOnOrderReadyForPickup ?? true,
    orderOutForDeliveryWhatsAppTemplate: doc.orderOutForDeliveryWhatsAppTemplate,
    orderReadyForPickupWhatsAppTemplate: doc.orderReadyForPickupWhatsAppTemplate,
    notifyCustomerOnOrderPreparing: doc.notifyCustomerOnOrderPreparing ?? true,
    orderPreparingWhatsAppTemplate: doc.orderPreparingWhatsAppTemplate,
    notifyCustomerOnOrderCancelled: doc.notifyCustomerOnOrderCancelled ?? true,
    orderCancelledWhatsAppTemplate: doc.orderCancelledWhatsAppTemplate,
    notifyCustomerOnOrderDelivered: doc.notifyCustomerOnOrderDelivered ?? true,
    orderDeliveredWhatsAppTemplate: doc.orderDeliveredWhatsAppTemplate,
    facebookUrl: doc.facebookUrl,
    cashRegisterMode: doc.cashRegisterMode ?? 'manual',
    customerBlockingEnabled: doc.customerBlockingEnabled ?? false,
    autoPrintEnabled: doc.autoPrintEnabled ?? false,
    autoPrintIntervalSeconds: doc.autoPrintIntervalSeconds ?? 10,
    autoPrintMaxAgeMinutes: doc.autoPrintMaxAgeMinutes ?? 5,
    autoPrintApiKey: doc.autoPrintApiKey,
    totemEnabled: doc.totemEnabled ?? false,
    totemPaymentMethods: doc.totemPaymentMethods ?? [],
    totemApiKey: doc.totemApiKey,
    paymentWebhookApiKey: doc.paymentWebhookApiKey,
    onlinePaymentsEnabled: doc.onlinePaymentsEnabled ?? false,
    asaasAccountId: doc.asaasAccountId,
    asaasWalletId: doc.asaasWalletId,
    asaasApiKey: doc.asaasApiKey,
    asaasWebhookToken: doc.asaasWebhookToken,
    asaasSubaccountData: doc.asaasSubaccountData,
    previousAsaasSubaccounts: doc.previousAsaasSubaccounts ?? [],
    asaasCheckoutWebhookRegistered: doc.asaasCheckoutWebhookRegistered,
    mercadoPagoAccessToken: doc.mercadoPagoAccessToken,
    mercadoPagoRefreshToken: doc.mercadoPagoRefreshToken,
    mercadoPagoUserId: doc.mercadoPagoUserId,
    mercadoPagoTokenExpiresAt: doc.mercadoPagoTokenExpiresAt,
    instagramAccessToken: doc.instagramAccessToken,
    instagramAccountId: doc.instagramAccountId,
    instagramPageId: doc.instagramPageId,
    instagramUsername: doc.instagramUsername,
    ifoodMerchantId: doc.ifoodMerchantId,
    ifoodClientId: doc.ifoodClientId,
    ifoodClientSecret: doc.ifoodClientSecret,
    ifoodConnectedAt: doc.ifoodConnectedAt,
  };
}

export class RestaurantMongooseRepository implements IRestaurantRepository {
  async create(input: {
    name: string;
    slug: string;
    phone?: string;
    businessHours?: IBusinessHours[];
    showHighlights?: boolean;
    showBanners?: boolean;
    allowCustomerCancelOrder?: boolean;
    productImageOnRight?: boolean;
    category?: string;
    newOrderRestaurantWhatsAppTemplate?: string;
    deliveryFeeMode?: DeliveryFeeMode;
    deliveryFeeCents?: number;
    welcomeMessage?: string;
    referralCode?: string;
  }): Promise<IRestaurant> {
    const doc = await RestaurantModel.create(input);
    return toEntity(doc.toObject());
  }

  async listAll(): Promise<IRestaurant[]> {
    const docs = await RestaurantModel.find({}).sort({ name: 1 }).lean<RestaurantLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findBySlug(slug: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ slug }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByReferralCode(code: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ referralCode: code }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findById(id).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant> {
    // specs/0039-onboarding-primeiro-acesso REQ-4 — qualquer save de verdade nesta tela marca o
    // horário como revisado (diferencia de nunca ter revisado desde o default automático do
    // autocadastro, REQ-1), independente de mudar algum valor ou só confirmar o que já estava.
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { businessHours, businessHoursReviewedAt: new Date() } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateBilling(id: string, billing: IRestaurantBilling): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { billing } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async markOnboardingItemVisited(id: string, key: string): Promise<void> {
    await RestaurantModel.updateOne({ _id: id }, { $addToSet: { onboardingVisitedItems: key } });
  }

  async setActive(id: string, isActive: boolean): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateSlug(id: string, slug: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { slug } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async findWhatsappConnectedIds(): Promise<string[]> {
    const docs = await RestaurantModel.find({ whatsappConnected: true }, { _id: 1 }).lean<{ _id: string }[]>();
    return docs.map((doc) => String(doc._id));
  }

  async setWhatsappConnected(id: string, connected: boolean): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { whatsappConnected: connected } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateRatingStats(id: string, rating: number, ratingCount: number): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { rating, ratingCount } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // specs/0139-impressao-automatica-bridge REQ-6/REQ-7.
  async regenerateAutoPrintApiKey(id: string): Promise<IRestaurant> {
    const apiKey = randomBytes(24).toString('hex');
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { autoPrintApiKey: apiKey } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async findByAutoPrintApiKey(apiKey: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ autoPrintApiKey: apiKey }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // specs/0155-app-totem-autoatendimento REQ-1/REQ-22.
  async regenerateTotemApiKey(id: string): Promise<IRestaurant> {
    const apiKey = randomBytes(24).toString('hex');
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { totemApiKey: apiKey } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async findByTotemApiKey(apiKey: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ totemApiKey: apiKey }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // specs/0140-confirmacao-automatica-pix REQ-1b.
  async regeneratePaymentWebhookApiKey(id: string): Promise<IRestaurant> {
    const apiKey = randomBytes(24).toString('hex');
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { paymentWebhookApiKey: apiKey } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async findByPaymentWebhookApiKey(apiKey: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ paymentWebhookApiKey: apiKey }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // specs/0101-integracao-asaas (fase 1). `subaccountData` adicionado num follow-up — dados
  // comerciais submetidos, sem segredo nenhum, pra retaguarda reexibir o formulário preenchido.
  async saveAsaasSubaccount(
    id: string,
    data: {
      asaasAccountId: string;
      asaasWalletId: string;
      asaasApiKey: string;
      asaasWebhookToken: string;
      subaccountData: RestaurantLeanDocument['asaasSubaccountData'];
    },
  ): Promise<IRestaurant> {
    const { subaccountData, ...rest } = data;
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { ...rest, asaasSubaccountData: subaccountData, onlinePaymentsEnabled: true } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // Achado real (pedido explícito do usuário) — "desvincular" NÃO apaga as credenciais
  // (`asaasAccountId`/`asaasWalletId`/`asaasApiKey`/`asaasWebhookToken`): a subconta continua
  // existindo no Asaas (não chamamos nada lá pra apagar), e o CPF/e-mail dela já está "em uso"
  // por ela mesma — se limpássemos as credenciais aqui, reativar com os mesmos dados tentaria
  // CRIAR uma subconta nova e bateria de novo no erro "CPF/e-mail já está em uso". Só pausa
  // (`onlinePaymentsEnabled: false`); `reactivateAsaasSubaccount` reconecta sem recriar nada.
  async disconnectAsaasSubaccount(id: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { onlinePaymentsEnabled: false } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // Achado real (pedido explícito do usuário) — reconecta uma subconta que já existe (tem
  // `asaasAccountId` salvo) sem chamar o Asaas de novo — usado quando o operador "ativa" de novo
  // depois de ter "desvinculado" antes, mesmo CPF/e-mail de sempre. Salva `subaccountData`
  // também aqui — necessário pra restaurantes vinculados antes desse campo existir (nunca
  // tiveram `asaasSubaccountData` salvo, formulário aparecia vazio mesmo já vinculados).
  async reactivateAsaasSubaccount(id: string, subaccountData: RestaurantLeanDocument['asaasSubaccountData']): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { onlinePaymentsEnabled: true, asaasSubaccountData: subaccountData } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // Pedido explícito do usuário (follow-up) — "esquecer" a subconta ATIVA, pra vincular uma
  // conta Asaas diferente (ver interface). Nunca chama o Asaas — a subconta antiga continua
  // existindo lá, intocada. Diferente da versão original (que fazia só `$unset`): arquiva os
  // campos ativos em `previousAsaasSubaccounts` antes de limpá-los — a chave de API só vem uma
  // vez na criação do Asaas, perdê-la de vez tornava essa subconta irrecuperável pela nossa UI.
  async forgetAsaasSubaccount(id: string): Promise<IRestaurant> {
    const current = await RestaurantModel.findById(id).lean<RestaurantLeanDocument>();
    if (!current?.asaasAccountId || !current.asaasWalletId || !current.asaasApiKey || !current.asaasWebhookToken || !current.asaasSubaccountData) {
      // Nada pra arquivar (restaurante nunca teve subconta vinculada) — só garante o estado limpo.
      const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { onlinePaymentsEnabled: false } }, { new: true }).lean<RestaurantLeanDocument>();
      return toEntity(doc as RestaurantLeanDocument);
    }

    const archived: IPreviousAsaasSubaccount = {
      asaasAccountId: current.asaasAccountId,
      asaasWalletId: current.asaasWalletId,
      asaasApiKey: current.asaasApiKey,
      asaasWebhookToken: current.asaasWebhookToken,
      subaccountData: current.asaasSubaccountData,
      archivedAt: new Date().toISOString(),
    };
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      {
        $set: { onlinePaymentsEnabled: false },
        $unset: { asaasAccountId: 1, asaasWalletId: 1, asaasApiKey: 1, asaasWebhookToken: 1, asaasSubaccountData: 1, asaasCheckoutWebhookRegistered: 1 },
        $push: { previousAsaasSubaccounts: archived },
      },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // Pedido explícito do usuário (follow-up) — restaura uma entrada de `previousAsaasSubaccounts`
  // de volta aos campos ativos, sem chamar o Asaas de novo (mesmo espírito de
  // `reactivateAsaasSubaccount`).
  //
  // Achado real — se já existisse uma subconta ATIVA (`asaasAccountId` setado) diferente da que
  // está sendo reconectada, sobrescrever direto com `$set` apagaria as credenciais dela sem
  // arquivar (perda de verdade, diferente de `forgetAsaasSubaccount`, que sempre arquiva antes
  // de limpar). Em vez de arquivar as duas coisas na mesma escrita (MongoDB rejeita `$push` e
  // `$pull` no mesmo caminho `previousAsaasSubaccounts` numa única `update`), a regra é mais
  // simples e segura: só reconecta quando não há nenhuma subconta ativa agora (o operador
  // precisa "Desvincular"/"Vincular outra conta" primeiro) — nunca troca uma ativa por outra
  // silenciosamente.
  async reconnectPreviousAsaasSubaccount(id: string, asaasAccountId: string): Promise<IRestaurant> {
    const current = await RestaurantModel.findOne({ _id: id, 'previousAsaasSubaccounts.asaasAccountId': asaasAccountId }).lean<RestaurantLeanDocument>();
    const entry = current?.previousAsaasSubaccounts?.find((item) => item.asaasAccountId === asaasAccountId);
    if (!entry) {
      throw new Error(`Subconta Asaas arquivada não encontrada (asaasAccountId: ${asaasAccountId})`);
    }
    if (current?.asaasAccountId) {
      throw new Error('Já existe uma subconta Asaas ativa — desvincule ou limpe os dados dela antes de reconectar outra.');
    }

    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      {
        $set: {
          onlinePaymentsEnabled: true,
          asaasAccountId: entry.asaasAccountId,
          asaasWalletId: entry.asaasWalletId,
          asaasApiKey: entry.asaasApiKey,
          asaasWebhookToken: entry.asaasWebhookToken,
          asaasSubaccountData: entry.subaccountData,
        },
        $pull: { previousAsaasSubaccounts: { asaasAccountId } },
      },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // specs/0170-integracao-mercado-pago.
  async saveMercadoPagoTokens(
    id: string,
    data: { mercadoPagoAccessToken: string; mercadoPagoRefreshToken: string; mercadoPagoUserId: string; mercadoPagoTokenExpiresAt: string },
  ): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // Pedido explícito do usuário (follow-up) — automação de postagens no Instagram.
  async saveInstagramTokens(
    id: string,
    data: { instagramAccessToken: string; instagramAccountId: string; instagramPageId: string; instagramUsername?: string },
  ): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async clearInstagramConnection(id: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $unset: { instagramAccessToken: 1, instagramAccountId: 1, instagramPageId: 1, instagramUsername: 1 } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  // specs/0090-integracao-ifood — mesmo molde de `saveMercadoPagoTokens` (credenciais digitadas
  // pelo operador, não OAuth).
  async saveIFoodCredentials(
    id: string,
    data: { ifoodMerchantId: string; ifoodClientId: string; ifoodClientSecret: string },
  ): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { ...data, ifoodConnectedAt: new Date().toISOString() } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async disconnectIFood(id: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $unset: { ifoodMerchantId: 1, ifoodClientId: 1, ifoodClientSecret: 1, ifoodConnectedAt: 1 } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async markAsaasCheckoutWebhookRegistered(id: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { asaasCheckoutWebhookRegistered: true } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }
}
