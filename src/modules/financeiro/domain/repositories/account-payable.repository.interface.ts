import { IAccountPayable } from '../entities/account.entity';
import { AccountListFilters } from '../build-account-list-query';

export interface AccountPayableInput {
  description: string;
  supplierId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
}

export interface IAccountPayableRepository {
  /** Achado de performance da auditoria pré-produção (31/10/2026) — `filters` opcional; sem ele,
   * o default (ver `buildAccountListQuery`) já evita carregar o histórico inteiro de anos. */
  listByRestaurant(restaurantId: string, filters?: AccountListFilters): Promise<IAccountPayable[]>;
  /**
   * Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
   * clientes e estoque": método NOVO, separado de `listByRestaurant` de propósito (mesmo padrão
   * de `IProductRepository.listByRestaurantPage`) — só a tela de lista usa este aqui.
   */
  listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    filters?: AccountListFilters,
  ): Promise<{ items: IAccountPayable[]; total: number }>;
  findById(id: string): Promise<IAccountPayable | null>;
  create(restaurantId: string, input: AccountPayableInput): Promise<IAccountPayable>;
  update(id: string, input: AccountPayableInput): Promise<IAccountPayable>;
  /** REQ-2 — `paidValue` pode diferir do `value` original (juros/desconto). */
  markAsPaid(id: string, paidValue: number, paidAt: Date): Promise<IAccountPayable>;
}
