/**
 * docs/architecture/data-model.md §CustomerSummary — não é uma entidade nova de verdade, é uma
 * **agregação** de `Customer` + `Order` escopada ao `restaurantId` do operador logado (o
 * `Customer` em si é global no sistema — a retaguarda nunca vê pedidos feitos em outro
 * restaurante, só agrega os pedidos deste). Calculada sob demanda (specs/0016-clientes-retaguarda,
 * plan.md "Decisões (ADR)"), nunca persistida.
 */
export interface ICustomerSummary {
  customerId: string;
  name: string;
  /** snapshot de `Customer.phone`, que é opcional — nem todo cliente preencheu telefone. */
  phone?: string;
  /** REQ-1 — total de pedidos feitos **neste** restaurante (todos os status, mesmo critério
   * literal de `docs/architecture/data-model.md`, sem excluir cancelados como `SalesSummary`
   * faz pra receita realizada — aqui é contagem de relacionamento com o cliente, não faturamento). */
  totalOrders: number;
  /** REQ-1 — soma de `Order.total` **neste** restaurante. */
  totalSpent: number;
  lastOrderAt?: string;
}
