import { ICustomer } from '../entities/customer.entity';
import { PaymentMethod } from '../../../orders/domain/entities/order.entity';

/**
 * `email`/`photoUrl` sempre inclusos (mesmo quando só `phone`/`document` mudam) — necessário pro
 * `upsert`: no primeiro `PUT /customers/me`, o documento ainda não existe, e `name`/`email` são
 * obrigatórios no schema (`CustomersController` resolve os valores atuais antes de chamar isto).
 */
export type CustomerProfileUpsert = Pick<ICustomer, 'name' | 'email'> &
  Partial<Pick<ICustomer, 'photoUrl' | 'phone' | 'document'>>;

export interface ICustomerRepository {
  findById(id: string): Promise<ICustomer | null>;

  /** Pedido explícito do usuário (módulo `customer-blocking`) — resolve o nome do cliente (se
   * algum já pediu com esse telefone) pra exibição na lista de bloqueados; `phone` já normalizado
   * pelo chamador. `null` se nenhum `Customer` tem esse telefone ainda. */
  findByPhone(phone: string): Promise<ICustomer | null>;

  /** Foto própria removida pelo cliente: tira `photoUrl` do documento (volta a valer a foto da conta). */
  removePhoto(id: string): Promise<ICustomer | null>;

  /**
   * specs/0171-meios-pagamento-por-cliente REQ-4 — só a retaguarda chama isto
   * (`CustomerPaymentMethodsController`, dono/gerente), nunca o fluxo do próprio cliente. Método
   * dedicado, não reusa `upsertProfile`: nunca cria o `Customer` (`null` se o id não existir).
   * `null`/array vazio limpa `allowedPaymentMethods` (volta a "sem restrição própria", REQ-1).
   */
  updateAllowedPaymentMethods(id: string, allowedPaymentMethods: PaymentMethod[] | null): Promise<ICustomer | null>;

  /** REQ-1 (`specs/0011-perfil-cliente`) — cria se ainda não existir, atualiza se existir. */
  upsertProfile(id: string, patch: CustomerProfileUpsert): Promise<ICustomer>;

  /**
   * specs/0155-app-totem-autoatendimento REQ-16a (decisão confirmada) — cria um `Customer`
   * avulso (só nome, telefone se informado — sem conta/login) pra cada pedido do totem, já que
   * não há cliente autenticado via Firebase (REQ-16). `id` gerado aqui (diferente de todo outro
   * `Customer`, cujo `id` é sempre o UID do Firebase) — preserva a regra de que todo `Order`
   * sempre tem um `Customer` associado (`Order.customerId`), sem tornar o campo opcional nem
   * revisar os lugares que já assumem essa associação (recibo, retaguarda). `email` sintético
   * (nunca usado de verdade) só porque o schema exige o campo — mesmo padrão de
   * `anonymize`, que já grava um e-mail sintético pra um `Customer` sem e-mail real.
   */
  createStandalone(name: string, phone?: string): Promise<ICustomer>;

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
