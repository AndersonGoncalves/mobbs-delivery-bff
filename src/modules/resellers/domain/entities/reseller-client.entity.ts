/** specs/0189-painel-revenda REQ-7/REQ-8/REQ-10 — `link` = vínculo automático no cadastro
 * (`?revenda=<code>`); `manual` = revendedor marcou um prospect salvo como convertido. */
export type ResellerClientOrigin = 'link' | 'manual';

/**
 * Vínculo "restaurante X é cliente efetivado do revendedor Y" — coleção própria (não um campo em
 * `Restaurant`), mesmo padrão de `IReferral` (`modules/referrals`). `restaurantId` é único entre
 * todos os documentos (plan.md decisão 3) — um restaurante pertence a no máximo um revendedor.
 */
export interface IResellerClient {
  id: string;
  resellerId: string;
  restaurantId: string;
  origin: ResellerClientOrigin;
  createdAt: Date;
}
