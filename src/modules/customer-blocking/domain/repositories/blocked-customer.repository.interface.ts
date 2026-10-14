import { IBlockedCustomer } from '../entities/blocked-customer.entity';

export interface IBlockedCustomerRepository {
  listByRestaurant(restaurantId: string): Promise<IBlockedCustomer[]>;
  /** `phone` já normalizado pelo chamador (controller). Upsert: bloquear um número já bloqueado
   * não duplica, só devolve o registro existente. */
  block(restaurantId: string, phone: string, customerName?: string): Promise<IBlockedCustomer>;
  /** `true` se removeu; `false` se o id não existe (ou é de outro restaurante). */
  unblock(id: string, restaurantId: string): Promise<boolean>;
  /** Usado na criação do pedido (`OrdersController`) — `phone` já normalizado pelo chamador. */
  isBlocked(restaurantId: string, phone: string): Promise<boolean>;
}
