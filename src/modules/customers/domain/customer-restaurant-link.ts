import type { ICustomer } from './entities/customer.entity';

/**
 * specs/0229 REQ-6 (opção A, decisão do usuário 27/11/2026) — relação "cliente ↔ restaurante" sem
 * pedido: o restaurante que CRIOU o cadastro (`createdByRestaurantId`) ou que só VINCULOU um cliente
 * que já existia (`linkedRestaurantIds`, "Novo cliente"/cadastro rápido do PDV com telefone já
 * cadastrado). Vale para VER o cliente (lista, busca por telefone), nunca para editar o cadastro —
 * isso fica com `isCreatedByRestaurant`/pedidos (customers-admin). Cadastros antigos em que
 * `createdByRestaurantId` foi sobrescrito num cliente do app continuam visíveis, mas não editáveis.
 */
export function isLinkedToRestaurant(customer: ICustomer, restaurantId: string): boolean {
  return customer.createdByRestaurantId === restaurantId || (customer.linkedRestaurantIds ?? []).includes(restaurantId);
}
