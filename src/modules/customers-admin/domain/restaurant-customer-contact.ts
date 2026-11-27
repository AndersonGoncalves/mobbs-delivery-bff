import type { ICustomer } from '../../customers/domain/entities/customer.entity';

/**
 * specs/0229-cadastro-cliente-retaguarda REQ-3/REQ-4 — o cadastro do cliente é único na plataforma
 * (o mesmo cliente pede em vários restaurantes e edita o próprio perfil no app). O restaurante só
 * mexe em CPF/e-mail quando o dado ainda está vazio, ou quando o cliente foi CRIADO por ele (critério
 * estrito: id `retaguarda_…` + `createdByRestaurantId`; um cliente do app só "vinculado" não conta).
 */

/** E-mail interno gerado para cliente sem e-mail (retaguarda, totem…) — conta como vazio. */
export function isTechnicalEmail(email?: string): boolean {
  return !email || email.endsWith('.mobbs-delivery.local');
}

export function isCreatedByRestaurant(customer: ICustomer, restaurantId: string): boolean {
  return customer.id.startsWith('retaguarda_') && customer.createdByRestaurantId === restaurantId;
}

/**
 * specs/0229 REQ-6 (opção A, decisão do usuário 27/11/2026) — nome e telefone: só o restaurante que
 * CRIOU o cadastro, ou, no cliente avulso sem conta no app (`totem_…`: totem, iFood, 99Food, Keeta,
 * PDV), quem já o atendeu. Cliente do app: só ele, pelo app.
 */
export function canRestaurantEditNameAndPhone(customer: ICustomer, restaurantId: string, hasOrdersHere: boolean): boolean {
  return isCreatedByRestaurant(customer, restaurantId) || (customer.id.startsWith('totem_') && hasOrdersHere);
}

export function canRestaurantEditDocument(customer: ICustomer, restaurantId: string): boolean {
  return isCreatedByRestaurant(customer, restaurantId) || !customer.document;
}

export function canRestaurantEditEmail(customer: ICustomer, restaurantId: string): boolean {
  return isCreatedByRestaurant(customer, restaurantId) || isTechnicalEmail(customer.email);
}

/** E-mail que o restaurante pode ver/editar (o interno nunca aparece na tela). */
export function visibleEmail(customer: ICustomer): string | undefined {
  return isTechnicalEmail(customer.email) ? undefined : customer.email;
}

/** E-mail interno de volta quando o restaurante apaga o e-mail (o campo é obrigatório no cadastro). */
export function technicalEmailFor(customerId: string): string {
  return `${customerId}@retaguarda.mobbs-delivery.local`;
}
