import { ICustomerSummary } from '../entities/customer-summary.entity';

export interface ICustomerSummaryRepository {
  /**
   * REQ-1/REQ-2/REQ-4 — clientes com pelo menos um pedido no restaurante do operador logado,
   * ordenados por `totalSpent` decrescente (padrão); reordenar por último pedido é
   * responsabilidade da apresentação (web, `CustomersListPage`), não deste método. `search`
   * (nome ou telefone, parcial, case-insensitive) filtra no próprio pipeline de agregação.
   *
   * Pedido explícito do usuário (follow-up) — `fromDate`/`toDate` (inclusive, `fromDate` à
   * meia-noite e `toDate` ao fim do dia) recalculam `totalOrders`/`totalSpent` só com os
   * pedidos daquele período; a LISTA de clientes (quem aparece) nunca muda com o período — um
   * cliente sem pedido no período continua na lista, com os dois campos zerados, nunca some.
   */
  listByRestaurant(restaurantId: string, search?: string, fromDate?: Date, toDate?: Date): Promise<ICustomerSummary[]>;
}
