import { IBusinessHours, IRestaurant } from '../entities/restaurant.entity';

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
    | 'welcomeMessage'
    | 'orderConfirmationGreeting'
    | 'shareMessage'
    | 'pixKey'
    | 'pixKeyType'
    | 'pixBeneficiaryName'
    | 'productImageOnRight'
    | 'showBestSellers'
    | 'bestSellersCount'
    | 'showHighlights'
    | 'showBanners'
    | 'banners'
    | 'allowCustomerCancelOrder'
    | 'deliveryFeeMode'
    | 'deliveryFeeZones'
    | 'instagramUrl'
    | 'showHighlightsInMultipleRows'
    | 'cartSuggestionsCount'
  >
>;

export interface IRestaurantRepository {
  /** specs/0038-autocadastro-restaurante REQ-2 — os demais campos nascem com o default já
   * declarado no schema do Mongoose (mesmo raciocínio de todo `Restaurant` hoje). */
  create(input: { name: string; slug: string; phone?: string }): Promise<IRestaurant>;
  findBySlug(slug: string): Promise<IRestaurant | null>;
  findById(id: string): Promise<IRestaurant | null>;
  updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant>;
  updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant>;
  setActive(id: string, isActive: boolean): Promise<IRestaurant>;
  updateSlug(id: string, slug: string): Promise<IRestaurant>;

  /** specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — atualizado pelo `WhatsAppConnectionService`
   * a cada mudança de estado da conexão (conectado/desconectado), não pelo operador direto. */
  setWhatsappConnected(id: string, connected: boolean): Promise<IRestaurant>;

  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — atualizado pelo `RatingsController`
   * a cada `POST /restaurants/:id/ratings`, nunca pelo operador direto (por isso fora de
   * `RestaurantProfileUpdate`, mesmo raciocínio de `setWhatsappConnected`). */
  updateRatingStats(id: string, rating: number, ratingCount: number): Promise<IRestaurant>;
}
