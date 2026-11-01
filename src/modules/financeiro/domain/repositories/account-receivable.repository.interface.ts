import { IAccountReceivable } from '../entities/account.entity';
import { AccountListFilters } from '../build-account-list-query';

export interface AccountReceivableInput {
  description: string;
  customerId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
}

export interface IAccountReceivableRepository {
  /** Achado de performance da auditoria pré-produção (31/10/2026) — `filters` opcional; sem ele,
   * o default (ver `buildAccountListQuery`) já evita carregar o histórico inteiro de anos. */
  listByRestaurant(restaurantId: string, filters?: AccountListFilters): Promise<IAccountReceivable[]>;
  /**
   * Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
   * clientes e estoque": método NOVO, separado de `listByRestaurant` de propósito (mesmo padrão
   * de `IProductRepository.listByRestaurantPage`) — só a tela de lista usa este aqui.
   */
  listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    filters?: AccountListFilters,
  ): Promise<{ items: IAccountReceivable[]; total: number }>;
  findById(id: string): Promise<IAccountReceivable | null>;
  create(restaurantId: string, input: AccountReceivableInput): Promise<IAccountReceivable>;
  update(id: string, input: AccountReceivableInput): Promise<IAccountReceivable>;
  /** REQ-3 — `receivedValue` pode diferir do `value` original. */
  markAsReceived(id: string, receivedValue: number, receivedAt: Date): Promise<IAccountReceivable>;
}
