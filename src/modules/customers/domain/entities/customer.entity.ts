import { PaymentMethod } from '../../../orders/domain/entities/order.entity';

/**
 * docs/architecture/data-model.md §Customer — `id` é o UID do Firebase Auth (nunca gerado pelo
 * BFF). Sem registro server-side no primeiro login (`specs/0002-autenticacao`, `AuthService`
 * nunca chama o BFF) — o documento só passa a existir no primeiro `PUT /customers/me`
 * (`specs/0011-perfil-cliente`); até lá, `GET /customers/me` sintetiza um perfil a partir do
 * próprio token, sem persistir nada (ver `CustomersController`).
 */
export interface ICustomer {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  phone?: string;
  document?: string;
  /** specs/0017-lgpd-privacidade REQ-2/REQ-4. */
  termsAcceptedAt?: string;
  termsVersionAccepted?: string;
  /**
   * specs/0171-meios-pagamento-por-cliente REQ-1 — restrição própria do cliente, editável só
   * pela retaguarda (`CustomerPaymentMethodsController`, nunca por `PUT /customers/me`).
   * `undefined`/`null` (default) = "sem restrição própria", o app libera todos os meios que
   * `Restaurant.acceptedPaymentMethods` aceita (REQ-3, interseção calculada no app, não aqui).
   */
  allowedPaymentMethods?: PaymentMethod[] | null;
  /** REQ-6 — presente só depois de anonimizado (`anonymize()`); `Order`s vinculados permanecem
   * intactos (REQ-7), só o `Customer` perde os dados de identificação. */
  deletedAt?: string;
}

/**
 * docs/architecture/data-model.md §Favorite (`specs/0012-favoritos`) — diferente de
 * `Customer`/`Address`, é escopado por restaurante (REQ-3: a lista de favoritos mostrada é a do
 * restaurante atual, não todos os favoritos do cliente em qualquer lugar).
 */
export interface IFavorite {
  id: string;
  customerId: string;
  restaurantId: string;
  productId: string;
  createdAt: string;
}

/**
 * docs/architecture/data-model.md §Address — `Customer`/`Address` não são escopados por
 * restaurante (mesma pessoa/endereço independente de qual restaurante o app está resolvido).
 */
export interface IAddress {
  id: string;
  customerId: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}
