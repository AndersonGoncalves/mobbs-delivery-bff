/**
 * Pedido explícito do usuário — bloqueio de cliente por telefone, escopado por restaurante (o
 * mesmo número pode estar bloqueado num restaurante e liberado em outro). `phone` sempre no
 * formato normalizado (`normalizePhoneNumber`, "55" + DDD + número, só dígitos) — mesma convenção
 * de `Customer.phone`, pra comparar sem depender de como o operador digitou.
 */
export interface IBlockedCustomer {
  id: string;
  restaurantId: string;
  phone: string;
  /** Snapshot do nome do `Customer` com esse telefone no momento do bloqueio, se existir um
   * cadastro — só pra exibição na lista (REQ-1); não é atualizado se o cliente mudar o nome
   * depois, e fica `undefined` se nenhum `Customer` tinha esse telefone ainda. */
  customerName?: string;
  createdAt: string;
}
