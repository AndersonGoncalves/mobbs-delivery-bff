import { ICashMovementEntry, ICashRegisterSession } from '../entities/cash-register.entity';

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
  /** Id do pagamento de mesa/balcão. Sem ele, a venda (delivery/retirada) é uma entrada por pedido. */
  paymentId?: string;
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
  /** (achado real, pedido explícito do usuário) — mesmo recorte de `tableSales`/`deliverySales`
   * já usado em "Movimento do dia", agora também no histórico de fechamentos. */
  tableSales: number;
  deliverySales: number;
  /** Pedido explícito do usuário (follow-up, achado real 06/11/2026) — vendas automáticas
   * lançadas DEPOIS do fechamento desta sessão (`addAutomaticEntry`, quando não existe nenhuma
   * sessão aberta mas a de hoje já existe fechada). Ficam de fora de todos os campos acima
   * (conferência já feita nunca muda retroativamente), mas aparecem aqui pra nunca ficar
   * escondidas. Sessão ainda aberta: sempre `[]` (nada pode ser "tardio" antes do fechamento). */
  lateMovements: ICashMovementEntry[];
}

/**
 * Em modo automático, verifica a abertura pelo horário do restaurante antes do lançamento
 * (`ensureAutomaticSchedule`). Em qualquer modo, uma venda nunca fica sem caixa pra entrar —
 * se não existe nenhuma sessão aberta, `addAutomaticEntry` abre uma (primeira venda do dia) ou
 * lança na de hoje já fechada, marcado como tardio (`CashClosingSummary.lateMovements`) — ver
 * cabeçalho completo do método.
 *
 * `syncOpenSession` recria as entradas que faltam na sessão aberta (pagamentos recebidos antes
 * desta regra, ou com a sessão já aberta).
 *
 * specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule`/
 * `getBalanceByPaymentMethod`/`getClosingSummary` adicionados pra REQ-3/REQ-4/REQ-9/REQ-10/REQ-11.
 */
export interface ICashRegisterService {
  addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void>;

  /** Garante um movimento para cada pagamento já recebido na sessão aberta. */
  syncOpenSession(restaurantId: string, sessionId?: string): Promise<void>;

  /**
   * 0176: abertura lazy por data civil, seguindo businessHours. Nunca fecha automaticamente
   * nem reabre uma data já fechada. Caixas de datas anteriores permanecem pendentes.
   */
  ensureAutomaticSchedule(restaurantId: string, now?: Date): Promise<void>;

  /** REQ-9 — saldo da sessão (aberta ou fechada) separado por forma de pagamento. */
  getBalanceByPaymentMethod(sessionId: string): Promise<CashBalanceByPaymentMethod>;

  /** REQ-9/REQ-10 — mesmo cálculo de `getBalanceByPaymentMethod`, com o resto do resumo usado
   * tanto pelo "saldo atual" (sessão aberta) quanto pelo histórico de fechamentos. */
  getClosingSummary(sessionId: string): Promise<CashClosingSummary>;
}
