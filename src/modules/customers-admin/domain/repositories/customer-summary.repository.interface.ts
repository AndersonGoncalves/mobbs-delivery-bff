import { ICustomerSummary } from '../entities/customer-summary.entity';

export interface ICustomerSummaryRepository {
  /**
   * REQ-1/REQ-2/REQ-4 — clientes com pelo menos um pedido no restaurante do operador logado,
   * ordenados por `totalSpent` decrescente (padrão); reordenar por último pedido é
   * responsabilidade da apresentação (web, `CustomersListPage`), não deste método. `search`
   * (nome ou telefone, parcial, case-insensitive) filtra no próprio pipeline de agregação.
   */
  listByRestaurant(restaurantId: string, search?: string): Promise<ICustomerSummary[]>;
}
