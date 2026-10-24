import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { getRestaurantLocalTime, minutesSinceMidnight } from '../../../restaurants/domain/is-restaurant-open-now';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import { cashRegisterDate, cashRegisterPeriodEnd } from '../../domain/cash-register-date';
import {
  AutomaticCashEntryInput,
  CashBalanceByPaymentMethod,
  CashClosingSummary,
  ICashRegisterService,
} from '../../domain/services/i-cash-register.service';

// specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — mesmo enum de
// `Order.paymentMethod`/`Payment.method`.
const ALL_PAYMENT_METHODS: PaymentMethod[] = ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'];

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  creditCard: 'Cartão de Crédito Maquininha',
  creditCardOnline: 'Cartão (online)',
  debitCard: 'Cartão de Débito Maquininha',
};

// Identifica apenas a abertura automática; fechamento exige um operador.
const AUTOMATIC_ACTOR = 'automatico';

function zeroBalanceByPaymentMethod(): Record<PaymentMethod, number> {
  return Object.fromEntries(ALL_PAYMENT_METHODS.map((method) => [method, 0])) as Record<PaymentMethod, number>;
}

/**
 * specs/0014-financeiro REQ-5 — chamado pelo `OrdersController` ao marcar um pedido como
 * entregue/retirado (`docs/architecture/data-model.md`, único status que cobre os dois casos).
 * Regra completa fica **aqui** (não no controller de orders): qualquer forma de pagamento lança
 * uma entrada, e só se houver sessão de caixa aberta (nunca força abertura). Pedido de mesa entra
 * por pagamento (`paymentId`), delivery/retirada entra uma vez ao ser marcado como entregue.
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
    if (!(input.amount > 0)) return;
    await this.ensureAutomaticSchedule(input.restaurantId);
    const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (!session || cashRegisterDate(new Date(session.openedAt)) !== cashRegisterDate()) return;
    await this.recordAutomaticEntry(session.id, input);
  }

  private async recordAutomaticEntry(sessionId: string, input: AutomaticCashEntryInput): Promise<void> {
    const movements = await this.cashRegisterRepository.listMovements(sessionId);
    const alreadyRecorded = input.paymentId
      ? movements.some((movement) => movement.paymentId === input.paymentId || (movement.orderId === input.orderId && !movement.paymentId))
      : movements.some((movement) => movement.orderId === input.orderId && !movement.paymentId);
    if (alreadyRecorded) return;

    const methodLabel = PAYMENT_LABEL[input.paymentMethod] ?? input.paymentMethod;
    await this.cashRegisterRepository.addMovement(sessionId, {
      type: 'entrada',
      amount: input.amount,
      description: input.paymentId
        ? `Mesa/balcão #${input.orderNumber} (${methodLabel})`
        : `Venda #${input.orderNumber} (${methodLabel})`,
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
      paymentId: input.paymentId,
    });
  }

  async syncOpenSession(restaurantId: string, sessionId?: string): Promise<void> {
    const session = sessionId
      ? await this.cashRegisterRepository.findById(sessionId)
      : await this.cashRegisterRepository.findOpenSessionByRestaurant(restaurantId);
    if (!session || session.restaurantId !== restaurantId || session.status !== 'aberto') return;

    const from = new Date(session.openedAt);
    const to = cashRegisterPeriodEnd(session);
    const orders = await this.orderRepository.findReceivedSalesBetween(restaurantId, from, to);
    for (const order of orders) {
      if (order.orderType === 'table') {
        for (const payment of order.tablePayments ?? []) {
          const paidAt = new Date(payment.paidAt);
          if (paidAt < from || paidAt >= to) continue;
          await this.recordAutomaticEntry(session.id, {
            restaurantId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount: payment.amount,
            paymentMethod: payment.method,
            paymentId: payment.id,
          });
        }
        continue;
      }
      if (order.status !== 'entregue') continue;
      await this.recordAutomaticEntry(session.id, {
        restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.total,
        paymentMethod: order.paymentMethod,
      });
    }
  }

  /** 0176: abre a data atual sem fechar pendências ou reabrir uma data já conferida. */
  async ensureAutomaticSchedule(restaurantId: string, now: Date = new Date()): Promise<void> {
    const restaurant = await this.restaurantRepository.findById(restaurantId);
    if (!restaurant || restaurant.cashRegisterMode !== 'automatic') return;

    const { dayOfWeek, minutes } = getRestaurantLocalTime(now);
    const todayHours = restaurant.businessHours.find((day) => day.dayOfWeek === dayOfWeek);
    const previousDay = getRestaurantLocalTime(new Date(now.getTime() - 86_400_000)).dayOfWeek;
    const previousHours = restaurant.businessHours.find((day) => day.dayOfWeek === previousDay);
    const withinToday = todayHours && !todayHours.isClosed && todayHours.openTime && todayHours.closeTime
      && minutes >= minutesSinceMidnight(todayHours.openTime)
      && (minutesSinceMidnight(todayHours.closeTime) <= minutesSinceMidnight(todayHours.openTime)
        || minutes < minutesSinceMidnight(todayHours.closeTime));
    const withinPreviousNight = previousHours && !previousHours.isClosed && previousHours.openTime && previousHours.closeTime
      && minutesSinceMidnight(previousHours.closeTime) <= minutesSinceMidnight(previousHours.openTime)
      && minutes < minutesSinceMidnight(previousHours.closeTime);
    if (!withinToday && !withinPreviousNight) return;
    const session = await this.cashRegisterRepository.findSessionByDate(restaurantId, cashRegisterDate(now));
    if (!session) {
      try {
        await this.cashRegisterRepository.open(restaurantId, 0, AUTOMATIC_ACTOR, true, now);
      } catch (error) {
        // Outra requisição pode ter aberto o mesmo caixa enquanto consultávamos.
        if (!(await this.cashRegisterRepository.findSessionByDate(restaurantId, cashRegisterDate(now)))) throw error;
      }
      return;
    }

    // Fechamento é sempre uma conferência manual, inclusive depois do horário.
  }

  async getBalanceByPaymentMethod(sessionId: string): Promise<CashBalanceByPaymentMethod> {
    return (await this.getClosingSummary(sessionId)).balanceByPaymentMethod;
  }

  /**
   * REQ-9 — delivery/retirada entram pelo total ao serem entregues no período da sessão. Mesa e
   * balcão entram por cada `tablePayment` recebido no período (a forma real do pagamento, não o
   * `paymentMethod` único do pedido). Movimento automático (com `orderId`) não é somado de novo:
   * o pedido ou o pagamento já entrou acima. Movimento manual (sem `orderId`) ajusta o dinheiro.
   */
  async getClosingSummary(sessionId: string): Promise<CashClosingSummary> {
    const session = await this.cashRegisterRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Sessão de caixa ${sessionId} não encontrada`);
    }

    const periodEnd = cashRegisterPeriodEnd(session);
    const orders = await this.orderRepository.findReceivedSalesBetween(session.restaurantId, new Date(session.openedAt), periodEnd);

    const salesByPaymentMethod = zeroBalanceByPaymentMethod();
    let totalSales = 0;
    for (const order of orders) {
      if (order.orderType === 'table') {
        for (const payment of order.tablePayments ?? []) {
          const paidAt = new Date(payment.paidAt);
          if (paidAt < new Date(session.openedAt) || paidAt >= periodEnd) continue;
          const method = payment.method as PaymentMethod;
          if (!(method in salesByPaymentMethod)) continue;
          salesByPaymentMethod[method] += payment.amount;
          totalSales += payment.amount;
        }
        continue;
      }
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
