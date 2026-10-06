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
    | 'shareMessage'
    | 'pixKey'
    | 'pixKeyType'
    | 'pixBeneficiaryName'
    | 'productImageOnRight'
    | 'showBestSellers'
    | 'bestSellersCount'
    | 'showHighlights'
    | 'showBanners'
    | 'showReorderTag'
    | 'showMostPurchasedTag'
    | 'banners'
    | 'allowCustomerCancelOrder'
    | 'deliveryFeeMode'
    | 'deliveryFeeZones'
    | 'instagramUrl'
    | 'showHighlightsInMultipleRows'
    | 'cartSuggestionsCount'
    | 'acceptedPaymentMethods'
    | 'orderTypes'
    | 'welcomeMessage'
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
}
