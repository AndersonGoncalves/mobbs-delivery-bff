import { CashMovementType, ICashMovementEntry, ICashRegisterSession } from '../entities/cash-register.entity';

export interface NewCashMovementInput {
  type: CashMovementType;
  amount: number;
  description: string;
  /** REQ-5 — preenchido só no lançamento automático (pedido pago via Pix), nunca no manual (REQ-6). */
  orderId?: string;
}

export interface CloseCashRegisterResult {
  session: ICashRegisterSession;
  /** `openingBalance` + entradas − saídas, calculado sob demanda (nunca persistido). */
  calculatedBalance: number;
  /** REQ-7 — `countedValue` (contado fisicamente) − `calculatedBalance`. */
  difference: number;
}

export interface ICashRegisterRepository {
  /** REQ-8 — no máximo uma sessão `aberto` por restaurante ao mesmo tempo. */
  findOpenSessionByRestaurant(restaurantId: string): Promise<ICashRegisterSession | null>;
  findById(id: string): Promise<ICashRegisterSession | null>;
  open(restaurantId: string, openingBalance: number, openedBy?: string): Promise<ICashRegisterSession>;
  addMovement(sessionId: string, input: NewCashMovementInput): Promise<ICashMovementEntry>;
  listMovements(sessionId: string): Promise<ICashMovementEntry[]>;
  /** REQ-7 — calcula o saldo (abertura + entradas − saídas) sem persistir nada. */
  getCalculatedBalance(sessionId: string): Promise<number>;
  close(sessionId: string, countedValue: number, closedBy?: string): Promise<CloseCashRegisterResult>;
}
