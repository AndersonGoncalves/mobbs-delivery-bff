import { ICashRegisterSession } from '../entities/cash-register.entity';

/**
 * specs/0014-financeiro REQ-5 — entrada usada pelo módulo `orders` ao marcar um pedido como
 * entregue/retirado. Deliberadamente **não** importa `IOrder` (`modules/orders/domain/entities`)
 * pra não criar uma dependência circular entre os dois módulos (orders -> este serviço,
 * financeiro -> nada de orders) — mesmo raciocínio de inversão de dependência já aplicado entre
 * módulos Flutter (`.claude/skills/add-module`), adaptado pro BFF: o módulo provedor do serviço
 * (financeiro) expõe a interface (mesmo padrão de `IWhatsAppNotificationService`, definida em
 * `notifications` e consumida por `orders`), mas com um DTO próprio em vez do tipo de domínio do
 * chamador.
 */
export interface AutomaticCashEntryInput {
  restaurantId: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  /**
   * Comparado com `'pix'` dentro da implementação — recebido como `string` (não o enum
   * `PaymentMethod` de `orders/domain/entities`) justamente pra não importar esse módulo aqui.
   */
  paymentMethod: string;
}

/**
 * specs/0118-controle-caixa-automatico-redes-sociais — resultado de `getBalanceByPaymentMethod`/
 * `getClosingSummary`: chaves são os valores de `PaymentMethod` (`modules/orders/domain/entities`),
 * mas como `string` por propósito — mesmo raciocínio de `AutomaticCashEntryInput.paymentMethod`
 * acima, evita importar o tipo de `orders` neste arquivo de domínio.
 */
export type CashBalanceByPaymentMethod = Record<string, number>;

/** REQ-9/REQ-10 — resumo de uma sessão (aberta = "saldo atual", fechada = um item do histórico). */
export interface CashClosingSummary {
  session: ICashRegisterSession;
  balanceByPaymentMethod: CashBalanceByPaymentMethod;
  /** Soma de `Order.total` (status `entregue`) no período da sessão, sem os ajustes manuais que
   * `balanceByPaymentMethod.cash` inclui. */
  totalSales: number;
  /** `openingBalance` + entradas − saídas, sempre recalculado (nunca persistido). */
  calculatedBalance: number;
  /** Sessão aberta: sempre `0` (ainda não fechou). Sessão fechada: `closingBalance` − `calculatedBalance`. */
  difference: number;
}

/**
 * REQ-5 (`addAutomaticEntry`) — nunca lança pro chamador: se o método de pagamento não for
 * `pix`, ou não houver sessão de caixa aberta no restaurante, simplesmente não lança nada (não
 * força abertura automática de caixa, decisão confirmada em `spec.md`).
 *
 * specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule`/
 * `getBalanceByPaymentMethod`/`getClosingSummary` adicionados pra REQ-3/REQ-4/REQ-9/REQ-10/REQ-11.
 */
export interface ICashRegisterService {
  addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void>;

  /**
   * REQ-3/REQ-4/REQ-6 — "cron" lazy: chamado no início de toda rota de `CashRegisterController`
   * que lê ou muda o caixa (ver `plan.md`, "Mecanismo do automático"). Se
   * `Restaurant.cashRegisterMode !== 'automatic'`, não faz nada. Em modo automático, compara
   * `now` contra o `IBusinessHours` do dia da semana corrente: sem sessão aberta e já passou do
   * horário de abertura (mas não do de fechamento) → abre; sessão aberta e já passou do horário
   * de fechamento → fecha com o saldo calculado. Qualquer outro caso (inclusive dia com
   * `isClosed: true`, ou sessão duplicada) é no-op silencioso, nunca lança erro.
   */
  ensureAutomaticSchedule(restaurantId: string, now?: Date): Promise<void>;

  /** REQ-9 — saldo da sessão (aberta ou fechada) separado por forma de pagamento. */
  getBalanceByPaymentMethod(sessionId: string): Promise<CashBalanceByPaymentMethod>;

  /** REQ-9/REQ-10 — mesmo cálculo de `getBalanceByPaymentMethod`, com o resto do resumo usado
   * tanto pelo "saldo atual" (sessão aberta) quanto pelo histórico de fechamentos. */
  getClosingSummary(sessionId: string): Promise<CashClosingSummary>;
}
