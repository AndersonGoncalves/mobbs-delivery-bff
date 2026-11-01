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
   *
   * Usada por quem precisa da lista INTEIRA (nenhum consumidor interno do BFF hoje, mas mantida
   * sem paginação de propósito — ver `listByRestaurantPage` pra paginação real); nunca remover
   * sem confirmar que nada mais depende dela.
   */
  listByRestaurant(restaurantId: string, search?: string, fromDate?: Date, toDate?: Date): Promise<ICustomerSummary[]>;

  /**
   * Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
   * histórico inteiro": a cada abertura da tela "Clientes" da retaguarda, agregava TODOS os
   * pedidos do restaurante sem `$limit`. Método NOVO, separado de `listByRestaurant` de
   * propósito (mesmo padrão de `IProductRepository.listByRestaurantPage`) — só a tela de lista
   * de clientes usa este aqui; `total` é o total real (nunca o tamanho da página).
   */
  listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    search?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<{ items: ICustomerSummary[]; total: number }>;
}
