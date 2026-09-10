/**
 * docs/architecture/data-model.md §AccountPayable/§AccountReceivable — `AccountStatus` é
 * compartilhado pelas duas entidades (specs/0014-financeiro REQ-1/REQ-3). `cancelado` faz parte
 * do enum documentado, mas nenhum REQ desta v1 pede uma rota pra chegar nele (fora de escopo,
 * `spec.md` "Fora de escopo") — fica reservado pra uma spec futura de cancelamento de título.
 */
export type AccountStatus = 'aberto' | 'pago' | 'cancelado';

/**
 * docs/architecture/data-model.md §AccountPayable — despesa do restaurante (fornecedor, aluguel,
 * conta de consumo), independente de `PurchaseOrder` (specs/0015, fora de escopo aqui).
 */
export interface IAccountPayable {
  id: string;
  restaurantId: string;
  description: string;
  supplierId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
  status: AccountStatus;
  /** REQ-2 — preenchido quando `status` vira `pago`. */
  paidAt?: string;
  /** REQ-2 — pode diferir de `value` (juros/desconto). */
  paidValue?: number;
}

/**
 * docs/architecture/data-model.md §AccountReceivable — cobre recebimentos fora do fluxo normal
 * de pedido (que já é pago na entrega/retirada via `Order`/`Payment`). Uso esperado baixo
 * (spec.md), mas com a mesma forma de `AccountPayable` (REQ-3).
 */
export interface IAccountReceivable {
  id: string;
  restaurantId: string;
  description: string;
  customerId?: string;
  issueDate: string;
  dueDate: string;
  value: number;
  status: AccountStatus;
  /** REQ-3 — preenchido quando `status` vira `pago` (recebido). */
  receivedAt?: string;
  /** REQ-3 — pode diferir de `value`. */
  receivedValue?: number;
}
