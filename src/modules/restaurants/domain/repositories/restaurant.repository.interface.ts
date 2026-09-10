import { IBusinessHours, IRestaurant } from '../entities/restaurant.entity';

export type RestaurantProfileUpdate = Partial<
  Pick<
    IRestaurant,
    | 'name'
    | 'logoUrl'
    | 'primaryColor'
    | 'address'
    | 'phone'
    | 'minimumOrderValue'
    | 'welcomeMessage'
    | 'orderConfirmationGreeting'
    | 'pixKey'
    | 'pixKeyType'
    | 'pixBeneficiaryName'
  >
>;

export interface IRestaurantRepository {
  findBySlug(slug: string): Promise<IRestaurant | null>;
  findById(id: string): Promise<IRestaurant | null>;
  updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant>;
  updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant>;
  setActive(id: string, isActive: boolean): Promise<IRestaurant>;
  updateSlug(id: string, slug: string): Promise<IRestaurant>;

  /** specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — atualizado pelo `WhatsAppConnectionService`
   * a cada mudança de estado da conexão (conectado/desconectado), não pelo operador direto. */
  setWhatsappConnected(id: string, connected: boolean): Promise<IRestaurant>;
}
