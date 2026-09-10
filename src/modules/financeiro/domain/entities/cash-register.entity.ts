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
  createdAt: string;
}
