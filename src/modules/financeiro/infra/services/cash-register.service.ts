import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { getRestaurantLocalTime, minutesSinceMidnight } from '../../../restaurants/domain/is-restaurant-open-now';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import {
  AutomaticCashEntryInput,
  CashBalanceByPaymentMethod,
  CashClosingSummary,
  ICashRegisterService,
} from '../../domain/services/i-cash-register.service';

// specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — mesmo enum de
// `Order.paymentMethod`/`Payment.method`.
const ALL_PAYMENT_METHODS: PaymentMethod[] = ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'];

// specs/0118-controle-caixa-automatico-redes-sociais REQ-3/REQ-4 — identifica `openedBy`/
// `closedBy` de um ciclo automático (não um id de operador de verdade, `req.user.uid`).
const AUTOMATIC_ACTOR = 'automatico';

function zeroBalanceByPaymentMethod(): Record<PaymentMethod, number> {
  return Object.fromEntries(ALL_PAYMENT_METHODS.map((method) => [method, 0])) as Record<PaymentMethod, number>;
}

/**
 * specs/0014-financeiro REQ-5 — chamado pelo `OrdersController` ao marcar um pedido como
 * entregue/retirado (`docs/architecture/data-model.md`, único status que cobre os dois casos).
 * Regra completa fica **aqui** (não no controller de orders), pra manter as duas condições de
 * REQ-5 num único lugar testável: só `pix` lança automaticamente, e só se houver sessão de caixa
 * aberta (nunca força abertura).
 *
 * specs/0118-controle-caixa-automatico-redes-sociais — ganhou `ensureAutomaticSchedule` (REQ-3/
 * REQ-4/REQ-6, chamado pelo `CashRegisterController` no início de toda rota que lê/muda o caixa)
 * e `getBalanceByPaymentMethod`/`getClosingSummary` (REQ-9/REQ-10), por isso agora depende também
 * de `IRestaurantRepository` (ler `cashRegisterMode`/`businessHours`) e `IOrderRepository` (somar
 * vendas por forma de pagamento) — nenhum dos dois cruza pra dentro do `i-cash-register.service.ts`
 * (domínio), só esta implementação de infra.
 */
export class CashRegisterService implements ICashRegisterService {
  constructor(
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly orderRepository: IOrderRepository,
  ) {}

  async addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void> {
    if (input.paymentMethod !== 'pix') return;

    const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (!session) return;

    await this.cashRegisterRepository.addMovement(session.id, {
      type: 'entrada',
      amount: input.amount,
      description: `Venda #${input.orderNumber} (Pix)`,
      orderId: input.orderId,
    });
  }

  /**
   * REQ-3/REQ-4/REQ-6 — ver `ICashRegisterService.ensureAutomaticSchedule`. Decisões do spec:
   * dia com `isClosed: true` (ou sem `businessHours` cadastrado pro dia) é no-op; sessão
   * duplicada (abrir já tendo uma aberta, ou fechar sem nenhuma aberta) também é no-op silencioso
   * — nunca lança erro, nunca derruba a rota que disparou a verificação.
   */
  async ensureAutomaticSchedule(restaurantId: string, now: Date = new Date()): Promise<void> {
    const restaurant = await this.restaurantRepository.findById(restaurantId);
    if (!restaurant || restaurant.cashRegisterMode !== 'automatic') return;

    const { dayOfWeek, minutes } = getRestaurantLocalTime(now);
    const todayHours = restaurant.businessHours.find((day) => day.dayOfWeek === dayOfWeek);
    if (!todayHours || todayHours.isClosed || !todayHours.openTime || !todayHours.closeTime) return;

    const openMinutes = minutesSinceMidnight(todayHours.openTime);
    const closeMinutes = minutesSinceMidnight(todayHours.closeTime);
    const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(restaurantId);

    if (!session) {
      // REQ-3 — só abre dentro da janela do dia (nunca depois do horário de fechamento: nesse
      // caso o dia já "acabou" sem caixa, não faz sentido abrir um agora).
      if (minutes >= openMinutes && minutes < closeMinutes) {
        await this.cashRegisterRepository.open(restaurantId, 0, AUTOMATIC_ACTOR, true);
      }
      return;
    }

    // REQ-4 — sessão já aberta e o horário de fechamento já passou.
    if (minutes >= closeMinutes) {
      const calculatedBalance = await this.cashRegisterRepository.getCalculatedBalance(session.id);
      await this.cashRegisterRepository.close(session.id, calculatedBalance, AUTOMATIC_ACTOR, true);
    }
  }

  async getBalanceByPaymentMethod(sessionId: string): Promise<CashBalanceByPaymentMethod> {
    return (await this.getClosingSummary(sessionId)).balanceByPaymentMethod;
  }

  /**
   * REQ-9 — soma `Order.total` (status `entregue`) do restaurante no intervalo da sessão
   * (`openedAt` até `closedAt`, ou "agora" se ainda aberta), agrupado por `paymentMethod`; os
   * `CashMovementEntry` manuais (sem `orderId` — REQ-6) entram na forma "dinheiro", mesmo
   * raciocínio de sangria/suprimento de um caixa físico. As entradas automáticas de Pix (com
   * `orderId`, `addAutomaticEntry` acima) **não** são somadas de novo aqui — o pedido Pix já foi
   * contado na soma de `Order.total` acima, somar o `CashMovementEntry` dele também duplicaria o
   * valor.
   */
  async getClosingSummary(sessionId: string): Promise<CashClosingSummary> {
    const session = await this.cashRegisterRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Sessão de caixa ${sessionId} não encontrada`);
    }

    const periodEnd = session.closedAt ? new Date(session.closedAt) : new Date();
    const orders = await this.orderRepository.findByRestaurantBetween(session.restaurantId, new Date(session.openedAt), periodEnd);

    const salesByPaymentMethod = zeroBalanceByPaymentMethod();
    let totalSales = 0;
    for (const order of orders) {
      if (order.status !== 'entregue') continue;
      salesByPaymentMethod[order.paymentMethod] += order.total;
      totalSales += order.total;
    }

    const balanceByPaymentMethod: Record<PaymentMethod, number> = { ...salesByPaymentMethod };
    const movements = await this.cashRegisterRepository.listMovements(sessionId);
    for (const movement of movements) {
      if (movement.orderId) continue;
      balanceByPaymentMethod.cash += movement.type === 'entrada' ? movement.amount : -movement.amount;
    }

    const calculatedBalance = await this.cashRegisterRepository.getCalculatedBalance(sessionId);
    const difference = session.closingBalance !== undefined ? session.closingBalance - calculatedBalance : 0;

    return { session, balanceByPaymentMethod, totalSales, calculatedBalance, difference };
  }
}
