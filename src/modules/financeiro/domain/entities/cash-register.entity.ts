export type CashRegisterStatus = 'aberto' | 'fechado';

export type CashMovementType = 'entrada' | 'saida';

/**
 * docs/architecture/data-model.md §CashRegisterSession — um "turno" de caixa (specs/0014-financeiro
 * REQ-4/REQ-7/REQ-8). `closingBalance`, quando presente, é o valor **contado fisicamente** no
 * fechamento (REQ-7) — não o saldo calculado (esse é derivado sob demanda a partir de
 * `openingBalance` + `CashMovementEntry[]`, nunca persistido na sessão).
 */
export interface ICashRegisterSession {
  id: string;
  restaurantId: string;
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  closingBalance?: number;
  status: CashRegisterStatus;
  openedBy?: string;
  closedBy?: string;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-3/REQ-5 — abertura disparada por
   * `CashRegisterService.ensureAutomaticSchedule` (sem operador), não por um `POST .../open`
   * manual. Ausente/`false` = abertura manual (comportamento de sempre). */
  openedAutomatically?: boolean;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-4/REQ-5 — fechamento automático:
   * `closingBalance` é o saldo calculado (sem contagem física), não um valor contado pelo
   * operador — mostrado distinto no histórico (REQ-5). Ausente/`false` = fechamento manual. */
  closedAutomatically?: boolean;
}

/**
 * docs/architecture/data-model.md §CashMovementEntry — REQ-5 (automático, só Pix, `orderId`
 * preenchido) e REQ-6 (manual, `orderId` ausente).
 */
export interface ICashMovementEntry {
  id: string;
  cashRegisterSessionId: string;
  type: CashMovementType;
  amount: number;
  description: string;
  orderId?: string;
  /** Forma do pagamento que gerou a entrada automática. Ausente no lançamento manual (conta como dinheiro). */
  paymentMethod?: string;
  /** Id do `tablePayment` quando a entrada veio de um pagamento de mesa/balcão. */
  paymentId?: string;
  createdAt: string;
}
