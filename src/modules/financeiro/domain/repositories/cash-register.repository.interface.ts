import { CashMovementType, ICashMovementEntry, ICashRegisterSession } from '../entities/cash-register.entity';

export interface NewCashMovementInput {
  type: CashMovementType;
  amount: number;
  description: string;
  /** Preenchido no lançamento automático de uma venda, nunca no manual. */
  orderId?: string;
  paymentMethod?: string;
  paymentId?: string;
}

export interface CloseCashRegisterResult {
  session: ICashRegisterSession;
  /** `openingBalance` + entradas − saídas, calculado sob demanda (nunca persistido). */
  calculatedBalance: number;
  /** REQ-7 — `countedValue` (contado fisicamente) − `calculatedBalance`. */
  difference: number;
  tableSales?: number;
}

export interface ICashRegisterRepository {
  /** Caixa aberto na data civil atual, nunca um caixa pendente de outra data. */
  findOpenSessionByRestaurant(restaurantId: string): Promise<ICashRegisterSession | null>;
  findSessionByDate(restaurantId: string, date: string): Promise<ICashRegisterSession | null>;
  findPendingSessions(restaurantId: string): Promise<ICashRegisterSession[]>;
  findById(id: string): Promise<ICashRegisterSession | null>;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-3 — `openedAutomatically` default
   * `false`/ausente (abertura manual, comportamento de sempre); `true` quando chamado por
   * `CashRegisterService.ensureAutomaticSchedule`. */
  open(restaurantId: string, openingBalance: number, openedBy?: string, openedAutomatically?: boolean, now?: Date): Promise<ICashRegisterSession>;
  addMovement(sessionId: string, input: NewCashMovementInput): Promise<ICashMovementEntry>;
  listMovements(sessionId: string): Promise<ICashMovementEntry[]>;
  /** REQ-7 — calcula o saldo (abertura + entradas − saídas) sem persistir nada. */
  getCalculatedBalance(sessionId: string): Promise<number>;
  /** Fechamento sempre manual; campo legado permanece somente por compatibilidade histórica. */
  close(sessionId: string, countedValue: number, closedBy?: string, closedAutomatically?: boolean): Promise<CloseCashRegisterResult>;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-10 — fechamentos (`status: 'fechado'`)
   * cujo `closedAt` cai dentro de `[from, to]`, mais antigo primeiro. */
  findClosedSessionsBetween(restaurantId: string, from: Date, to: Date): Promise<ICashRegisterSession[]>;
  /** (ajuste, pedido explícito do usuário) — era só manuais (sem `orderId`); "Entradas e saídas"
   * do Histórico escondia as vendas automáticas (mesa/balcão, delivery) do período, mostrando só
   * sangria/suprimento. Agora todo `CashMovementEntry` de qualquer sessão deste restaurante, com
   * `createdAt` em `[from, to]` — manual ou automático. */
  findMovementsByRestaurantBetween(restaurantId: string, from: Date, to: Date): Promise<ICashMovementEntry[]>;
}
