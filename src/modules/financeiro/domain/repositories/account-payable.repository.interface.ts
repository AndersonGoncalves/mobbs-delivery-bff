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
  findById(id: string): Promise<IAccountPayable | null>;
  create(restaurantId: string, input: AccountPayableInput): Promise<IAccountPayable>;
  update(id: string, input: AccountPayableInput): Promise<IAccountPayable>;
  /** REQ-2 — `paidValue` pode diferir do `value` original (juros/desconto). */
  markAsPaid(id: string, paidValue: number, paidAt: Date): Promise<IAccountPayable>;
}
