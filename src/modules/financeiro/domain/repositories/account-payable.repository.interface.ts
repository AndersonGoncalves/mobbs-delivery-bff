import { IAccountPayable } from '../entities/account.entity';

export interface AccountPayableInput {
  description: string;
  supplierId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
}

export interface IAccountPayableRepository {
  listByRestaurant(restaurantId: string): Promise<IAccountPayable[]>;
  findById(id: string): Promise<IAccountPayable | null>;
  create(restaurantId: string, input: AccountPayableInput): Promise<IAccountPayable>;
  update(id: string, input: AccountPayableInput): Promise<IAccountPayable>;
  /** REQ-2 — `paidValue` pode diferir do `value` original (juros/desconto). */
  markAsPaid(id: string, paidValue: number, paidAt: Date): Promise<IAccountPayable>;
}
