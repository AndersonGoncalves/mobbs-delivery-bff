import { ICustomer } from '../entities/customer.entity';

/**
 * `email`/`photoUrl` sempre inclusos (mesmo quando só `phone`/`document` mudam) — necessário pro
 * `upsert`: no primeiro `PUT /customers/me`, o documento ainda não existe, e `name`/`email` são
 * obrigatórios no schema (`CustomersController` resolve os valores atuais antes de chamar isto).
 */
export type CustomerProfileUpsert = Pick<ICustomer, 'name' | 'email'> &
  Partial<Pick<ICustomer, 'photoUrl' | 'phone' | 'document'>>;

export interface ICustomerRepository {
  findById(id: string): Promise<ICustomer | null>;

  /** REQ-1 (`specs/0011-perfil-cliente`) — cria se ainda não existir, atualiza se existir. */
  upsertProfile(id: string, patch: CustomerProfileUpsert): Promise<ICustomer>;
}
