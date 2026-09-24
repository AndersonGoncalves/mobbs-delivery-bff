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

  /**
   * REQ-2/REQ-4 (`specs/0017-lgpd-privacidade`) — `upsert` igual `upsertProfile`: um cliente
   * Google recém-logado pode aceitar os termos ANTES de qualquer `PUT /customers/me` (nunca
   * chamado por `signInWithGoogle`, ver `GET /customers/me`), então o documento pode ainda não
   * existir. `profileOnInsert` só é usado nesse caso (`$setOnInsert`, nunca sobrescreve um
   * documento já existente) — bug real corrigido aqui: sem `upsert`, aceitar os termos no 1º
   * acesso falhava sempre (`findByIdAndUpdate` sem match devolve `null`).
   */
  acceptTerms(id: string, version: string, profileOnInsert: CustomerProfileUpsert): Promise<ICustomer>;

  /**
   * REQ-6/REQ-7 — anonimiza `name`/`email`/`phone`/`document`/`photoUrl` (substituídos por
   * valor genérico ou removidos) e marca `deletedAt`; o documento em si **não é apagado**
   * (preserva `id` pra não deixar `Order.customerId` órfão).
   */
  anonymize(id: string): Promise<void>;
}
