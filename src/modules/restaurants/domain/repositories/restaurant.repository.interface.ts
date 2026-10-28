import { DeliveryFeeMode, IBusinessHours, IRestaurant, IRestaurantBilling } from '../entities/restaurant.entity';

export type RestaurantProfileUpdate = Partial<
  Pick<
    IRestaurant,
    | 'name'
    | 'logoUrl'
    | 'primaryColor'
    | 'onPrimaryColor'
    | 'defaultProductImageUrl'
    | 'deliveryFeeCents'
    | 'address'
    | 'phone'
    | 'document'
    | 'minimumOrderValue'
    | 'stockControlEnabled'
    | 'shareMessage'
    | 'pixKey'
    | 'pixKeyType'
    | 'pixBeneficiaryName'
    | 'productImageOnRight'
    | 'useWhiteBackground'
    | 'showBestSellers'
    | 'showHighlights'
    | 'showBanners'
    | 'showReorderTag'
    | 'showMostPurchasedTag'
    | 'banners'
    | 'allowCustomerCancelOrder'
    | 'deliveryFeeMode'
    | 'deliveryFeeZones'
    | 'instagramUrl'
    | 'deliveryTimeMinMinutes'
    | 'deliveryTimeMaxMinutes'
    | 'pickupTimeMinMinutes'
    | 'pickupTimeMaxMinutes'
    | 'showHighlightsInMultipleRows'
    | 'showBestSellersInMultipleRows'
    | 'showCartSuggestions'
    | 'acceptedPaymentMethods'
    | 'autoConfirmPaymentMethods'
    | 'orderTypes'
    | 'welcomeMessage'
    | 'welcomeCardColor'
    | 'notifyRestaurantOnNewOrder'
    | 'newOrderRestaurantWhatsAppTemplate'
    | 'notifyCustomerOnOrderConfirmed'
    | 'orderConfirmedWhatsAppTemplate'
    | 'notifyCustomerOnPixConfirmed'
    | 'pixConfirmedWhatsAppTemplate'
    | 'notifyCustomerOnOrderCreated'
    | 'orderReceiptWhatsAppTemplate'
    | 'notifyCustomerOnOrderOutForDelivery'
    | 'notifyCustomerOnOrderReadyForPickup'
    | 'orderOutForDeliveryWhatsAppTemplate'
    | 'orderReadyForPickupWhatsAppTemplate'
    | 'notifyCustomerOnOrderPreparing'
    | 'orderPreparingWhatsAppTemplate'
    | 'notifyCustomerOnOrderCancelled'
    | 'orderCancelledWhatsAppTemplate'
    | 'facebookUrl'
    | 'cashRegisterMode'
    | 'customerBlockingEnabled'
    | 'autoPrintEnabled'
    | 'autoPrintIntervalSeconds'
    | 'autoPrintMaxAgeMinutes'
  >
>;

export interface IRestaurantRepository {
  /** specs/0038-autocadastro-restaurante REQ-2 — os demais campos nascem com o default já
   * declarado no schema do Mongoose (mesmo raciocínio de todo `Restaurant` hoje), exceto os
   * opcionais abaixo (specs/0039-onboarding-primeiro-acesso REQ-1/REQ-2/REQ-8) — usados só pelo
   * autocadastro, pra não mudar o default do schema em si (outros caminhos de criação, como os
   * scripts de seed, continuam pegando o default antigo se não passarem esses campos). */
  create(input: {
    name: string;
    slug: string;
    phone?: string;
    businessHours?: IBusinessHours[];
    showHighlights?: boolean;
    showBanners?: boolean;
    showReorderTag?: boolean;
    showMostPurchasedTag?: boolean;
    allowCustomerCancelOrder?: boolean;
    productImageOnRight?: boolean;
    category?: string;
    /** specs/0062-confirmar-pedido-whatsapp-restaurante REQ-3 — grava de verdade no autocadastro
     * (não só serve como fallback em memória no builder). */
    newOrderRestaurantWhatsAppTemplate?: string;
    /** specs/0039-onboarding-primeiro-acesso — autocadastro nasce com taxa de entrega grátis
     * (o dono configura de verdade depois na retaguarda), em vez do default `fixed`/`R$ 0` do
     * schema (mantido pros demais caminhos de criação). */
    deliveryFeeMode?: DeliveryFeeMode;
    deliveryFeeCents?: number;
    /** specs/0094-mensagem-boas-vindas-home REQ-2 — texto padrão gerado a partir do tipo de negócio. */
    welcomeMessage?: string;
    referralCode?: string;
  }): Promise<IRestaurant>;
  findBySlug(slug: string): Promise<IRestaurant | null>;
  /** specs/0106 REQ-2 — todos os restaurantes (painel da plataforma). */
  listAll(): Promise<IRestaurant[]>;
  /** specs/0043-programa-indicacao REQ-3 — resolve o restaurante indicador pelo código do link `?ref=`. */
  findByReferralCode(code: string): Promise<IRestaurant | null>;
  findById(id: string): Promise<IRestaurant | null>;
  updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant>;
  updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant>;
  /** specs/0185 — marca um item opcional do checklist de onboarding como visitado (idempotente). */
  markOnboardingItemVisited(id: string, key: string): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<IRestaurant>;
  /** specs/0042 — grava o estado de cobrança inteiro do restaurante (faixa, avisos, status, ciclo). */
  updateBilling(id: string, billing: IRestaurantBilling): Promise<IRestaurant>;
  updateSlug(id: string, slug: string): Promise<IRestaurant>;

  /** specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — atualizado pelo `WhatsAppConnectionService`
   * a cada mudança de estado da conexão (conectado/desconectado), não pelo operador direto. */
  setWhatsappConnected(id: string, connected: boolean): Promise<IRestaurant>;

  /** specs/0066 REQ-1 — ids dos restaurantes com `whatsappConnected: true`, pra reabrir as
   * sessões do Baileys quando o BFF sobe. */
  findWhatsappConnectedIds(): Promise<string[]>;

  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — atualizado pelo `RatingsController`
   * a cada `POST /restaurants/:id/ratings`, nunca pelo operador direto (por isso fora de
   * `RestaurantProfileUpdate`, mesmo raciocínio de `setWhatsappConnected`). */
  updateRatingStats(id: string, rating: number, ratingCount: number): Promise<IRestaurant>;

  /** specs/0139-impressao-automatica-bridge REQ-6/REQ-7 — gera e grava uma chave nova (string
   * aleatória), devolvendo o restaurante atualizado; fora de `RestaurantProfileUpdate` de
   * propósito (nunca setável por um PUT de perfil comum, só por este método dedicado — mesmo
   * raciocínio de `setWhatsappConnected`). */
  regenerateAutoPrintApiKey(id: string): Promise<IRestaurant>;

  /** specs/0139-impressao-automatica-bridge — resolve o restaurante dono da chave de API do
   * bridge (`X-Print-Api-Key`); usado pelo middleware de autenticação do bridge, não por operador
   * logado. */
  findByAutoPrintApiKey(apiKey: string): Promise<IRestaurant | null>;

  /** specs/0140-confirmacao-automatica-pix REQ-1b — mesmo raciocínio de
   * `regenerateAutoPrintApiKey`: gera e grava uma chave nova, fora de `RestaurantProfileUpdate`
   * de propósito (só por este método dedicado). */
  regeneratePaymentWebhookApiKey(id: string): Promise<IRestaurant>;

  /** specs/0140-confirmacao-automatica-pix REQ-1b — resolve o restaurante dono da chave de API
   * do webhook de pagamento (`X-Payment-Webhook-Api-Key`); usado pelo middleware de autenticação
   * do webhook, não por operador logado. */
  findByPaymentWebhookApiKey(apiKey: string): Promise<IRestaurant | null>;

  /** specs/0101-integracao-asaas (fase 1) — persiste os dados da subconta criada no Asaas
   * (`AsaasOnboardingController`); fora de `RestaurantProfileUpdate` de propósito — o `apiKey`
   * da subconta nunca deve ser setável por um PUT de perfil comum, só por este método dedicado. */
  saveAsaasSubaccount(
    id: string,
    data: {
      asaasAccountId: string;
      asaasWalletId: string;
      asaasApiKey: string;
      asaasWebhookToken: string;
      subaccountData: IRestaurant['asaasSubaccountData'];
    },
  ): Promise<IRestaurant>;

  /** Achado real (pedido explícito do usuário) — "desvincular" só pausa
   * (`onlinePaymentsEnabled: false`), NUNCA apaga `asaasAccountId`/`asaasApiKey`/etc. — a
   * subconta continua existindo no Asaas, e apagar essas credenciais impediria reconectar sem
   * recriar (e recriar com o mesmo CPF/e-mail falha, "já está em uso"). */
  disconnectAsaasSubaccount(id: string): Promise<IRestaurant>;

  /** Achado real (pedido explícito do usuário) — reconecta uma subconta já existente sem
   * chamar o Asaas de novo (ver `disconnectAsaasSubaccount`). `subaccountData` é salvo também
   * aqui — necessário pra restaurantes vinculados antes desse campo existir. */
  reactivateAsaasSubaccount(id: string, subaccountData: IRestaurant['asaasSubaccountData']): Promise<IRestaurant>;

  /** Pedido explícito do usuário (follow-up) — diferente de `disconnectAsaasSubaccount`
   * (pausa, mantém tudo pra reconectar a MESMA subconta): "esquece" a subconta ATIVA — deixa o
   * formulário em branco pra vincular uma conta Asaas DIFERENTE. A subconta antiga não é apagada
   * no Asaas (sem chamada à API deles), e também não é mais descartada por aqui: `asaasAccountId`/
   * `asaasWalletId`/`asaasApiKey`/`asaasWebhookToken`/`asaasSubaccountData` são ARQUIVADOS em
   * `previousAsaasSubaccounts` (não um `$unset` simples) — a chave de API só vem uma vez na
   * criação, então descartá-la de vez tornava essa subconta irrecuperável pela nossa própria UI,
   * mesmo continuando ativa no Asaas. `reconnectPreviousAsaasSubaccount` restaura uma entrada
   * arquivada de volta pros campos ativos. */
  forgetAsaasSubaccount(id: string): Promise<IRestaurant>;

  /** Pedido explícito do usuário (follow-up) — restaura uma subconta arquivada por
   * `forgetAsaasSubaccount` de volta aos campos ativos (`asaasAccountId`/.../`asaasSubaccountData`),
   * sem chamar o Asaas de novo (mesmo espírito de `reactivateAsaasSubaccount`); remove a entrada
   * de `previousAsaasSubaccounts` ao restaurar (nunca fica repetida em ativo + arquivo).
   * `asaasAccountId` identifica qual entrada do histórico restaurar. */
  reconnectPreviousAsaasSubaccount(id: string, asaasAccountId: string): Promise<IRestaurant>;

  /** specs/0170-integracao-mercado-pago — persiste o resultado da troca OAuth do restaurante
   * com o Mercado Pago (`MercadoPagoOAuthController`); fora de `RestaurantProfileUpdate` de
   * propósito, mesmo raciocínio de `saveAsaasSubaccount`. */
  saveMercadoPagoTokens(
    id: string,
    data: { mercadoPagoAccessToken: string; mercadoPagoRefreshToken: string; mercadoPagoUserId: string; mercadoPagoTokenExpiresAt: string },
  ): Promise<IRestaurant>;

  /** Pedido explícito do usuário (follow-up) — automação de postagens no Instagram, mesmo
   * raciocínio de `saveMercadoPagoTokens`. */
  saveInstagramTokens(
    id: string,
    data: { instagramAccessToken: string; instagramAccountId: string; instagramPageId: string; instagramUsername?: string },
  ): Promise<IRestaurant>;

  clearInstagramConnection(id: string): Promise<IRestaurant>;

  /** specs/0101-integracao-asaas (fase 2) — marca que o webhook adicional de eventos de checkout
   * (cartão) já foi registrado pra este restaurante, evitando registrar de novo a cada pedido
   * (`OrdersController.tryCreateAsaasCheckout`). */
  markAsaasCheckoutWebhookRegistered(id: string): Promise<IRestaurant>;
}
