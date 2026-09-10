import { IAccountReceivable } from '../entities/account.entity';

export interface AccountReceivableInput {
  description: string;
  customerId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
}

export interface IAccountReceivableRepository {
  listByRestaurant(restaurantId: string): Promise<IAccountReceivable[]>;
  findById(id: string): Promise<IAccountReceivable | null>;
  create(restaurantId: string, input: AccountReceivableInput): Promise<IAccountReceivable>;
  update(id: string, input: AccountReceivableInput): Promise<IAccountReceivable>;
  /** REQ-3 — `receivedValue` pode diferir do `value` original. */
  markAsReceived(id: string, receivedValue: number, receivedAt: Date): Promise<IAccountReceivable>;
}
