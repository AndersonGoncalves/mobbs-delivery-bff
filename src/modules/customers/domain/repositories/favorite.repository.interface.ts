import { IFavorite } from '../entities/customer.entity';

export interface IFavoriteRepository {
  /** REQ-3 (`specs/0012-favoritos`) — só os favoritos do restaurante atual. */
  listByRestaurant(customerId: string, restaurantId: string): Promise<IFavorite[]>;

  /** REQ-2 (`specs/0023-portabilidade-dados`) — todos os favoritos do cliente, em qualquer
   * restaurante (diferente de `listByRestaurant`, escopado); usado só na agregação de exportação
   * de dados. */
  listByCustomer(customerId: string): Promise<IFavorite[]>;

  /** REQ-1 — idempotente: tocar duas vezes no coração (ex.: double-tap) não duplica o registro. */
  add(customerId: string, restaurantId: string, productId: string): Promise<IFavorite>;

  /** REQ-2 — remove pelo par (customerId, productId); nunca lança se já não existir. */
  remove(customerId: string, productId: string): Promise<void>;
}
