import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { isPaidBeforeDelivery } from '../../../orders/domain/is-paid-before-delivery';
import { getRestaurantLocalTime, minutesSinceMidnight } from '../../../restaurants/domain/is-restaurant-open-now';
import { IRestaurant } from '../../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import { cashRegisterDate, cashRegisterPeriodEnd, nextAutoCloseAt } from '../../domain/cash-register-date';
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

  /**
   * Pedido explícito do usuário (follow-up, achado real 06/11/2026) — antes recusava lançar
   * quando não existia NENHUMA sessão aberta (ex. operador em modo manual esqueceu de abrir o
   * caixa): a venda em si seguia normal (mesa, PDV, delivery/retirada não dependem do caixa pra
   * funcionar), só o lançamento em si sumia, sem erro, sem aviso, pra sempre — nem reabrir
   * resgatava, porque nunca existiu sessão nenhuma pra reabrir. Agora:
   *
   * 1. Existe sessão aberta (de hoje ou pendente de antes) → lança nela, igual sempre
   *    (`cashRegisterPeriodEnd` cuida do período, sem teto de meia-noite).
   * 2. Não existe nenhuma aberta, mas já existe uma sessão de HOJE (ela só pode estar fechada,
   *    senão cairia no caso 1) → lança nela mesmo assim, só que depois do `closedAt` dela.
   *    `getCalculatedBalance`/`getClosingSummary` excluem automaticamente todo lançamento
   *    posterior ao fechamento da conferência já feita (saldo calculado/diferença continuam
   *    congelados como estavam na hora do fechamento) — e expõem esses lançamentos tardios à
   *    parte (`CashClosingSummary.lateMovements`), bem visíveis, nunca escondidos. Lançamento
   *    MANUAL continua proibido nesse caso (`CashRegisterController`, endpoint de movements) —
   *    só a venda automática passa por aqui.
   * 3. Não existe nenhuma sessão de hoje — abre uma nova, saldo inicial R$0,00, marcada
   *    "aberta automaticamente" (mesmo padrão/rótulo já usado por `ensureAutomaticSchedule`),
   *    pra nunca deixar a primeira venda do dia sem caixa pra entrar.
   */
  async addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void> {
    if (!(input.amount > 0)) return;
    await this.ensureAutomaticSchedule(input.restaurantId);
    const openSession = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (openSession) {
      await this.recordAutomaticEntry(openSession.id, input);
      return;
    }
    const latestClosedToday = await this.findLatestClosedSessionToday(input.restaurantId);
    if (latestClosedToday) {
      await this.recordAutomaticEntry(latestClosedToday.id, input);
      return;
    }
    const session = await this.openSessionForFirstSale(input.restaurantId);
    if (!session) return;
    await this.recordAutomaticEntry(session.id, input);
  }

  /**
   * specs/0213-caixa-pix-na-confirmacao REQ-3/REQ-4 — mesma busca/abertura de sessão de
   * `addAutomaticEntry` acima (mesmo raciocínio: o estorno nunca pode ficar sem caixa pra
   * entrar, mesmo que a sessão que lançou a entrada original já tenha fechado — cai como
   * lançamento tardio, igual qualquer outro movimento depois do fechamento).
   */
  async addAutomaticReversalEntry(input: AutomaticCashEntryInput): Promise<void> {
    if (!(input.amount > 0)) return;
    await this.ensureAutomaticSchedule(input.restaurantId);
    const openSession = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (openSession) {
      await this.recordAutomaticReversalEntry(openSession.id, input);
      return;
    }
    const latestClosedToday = await this.findLatestClosedSessionToday(input.restaurantId);
    if (latestClosedToday) {
      await this.recordAutomaticReversalEntry(latestClosedToday.id, input);
      return;
    }
    const session = await this.openSessionForFirstSale(input.restaurantId);
    if (!session) return;
    await this.recordAutomaticReversalEntry(session.id, input);
  }

  private async recordAutomaticReversalEntry(sessionId: string, input: AutomaticCashEntryInput): Promise<void> {
    const movements = await this.cashRegisterRepository.listMovements(sessionId);
    const alreadyReversed = movements.some((movement) => movement.orderId === input.orderId && movement.type === 'saida');
    if (alreadyReversed) return;

    const methodLabel = PAYMENT_LABEL[input.paymentMethod] ?? input.paymentMethod;
    await this.cashRegisterRepository.addMovement(sessionId, {
      type: 'saida',
      amount: input.amount,
      description: `Estorno - Venda #${input.orderNumber} (${methodLabel})`,
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
    });
  }

  /**
   * specs/0214-estorno-sobrepagamento-mesa REQ-2/REQ-8 — troco/estorno parcial de uma comanda de
   * mesa/balcão, DIFERENTE de `addAutomaticReversalEntry` acima: aquele é pro cancelamento
   * INTEIRO de um pedido (dedup única por `orderId`, nunca repete); este pode acontecer mais de
   * uma vez no mesmo pedido (cada edição que gera excedente, ou cada pagamento estornado num
   * cancelamento com mais de um `tablePayment`, é um evento novo) — por isso SEM dedup, confiando
   * em quem chama (`TableOrderService`) pra nunca chamar duas vezes pelo mesmo evento. Mesma
   * busca/abertura de sessão de `addAutomaticEntry` (nunca fica sem caixa pra entrar, mesmo numa
   * sessão já fechada — cai como lançamento tardio, igual qualquer outro).
   */
  async addPartialRefundEntry(input: AutomaticCashEntryInput): Promise<void> {
    if (!(input.amount > 0)) return;
    await this.ensureAutomaticSchedule(input.restaurantId);
    const openSession = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (openSession) {
      await this.recordPartialRefundEntry(openSession.id, input);
      return;
    }
    const latestClosedToday = await this.findLatestClosedSessionToday(input.restaurantId);
    if (latestClosedToday) {
      await this.recordPartialRefundEntry(latestClosedToday.id, input);
      return;
    }
    const session = await this.openSessionForFirstSale(input.restaurantId);
    if (!session) return;
    await this.recordPartialRefundEntry(session.id, input);
  }

  /**
   * specs/0219-multiplas-sessoes-caixa-por-dia — com múltiplas sessões por dia, o fallback de
   * lançamento tardio (nenhuma sessão aberta agora) passa a ser "a última sessão FECHADA de
   * hoje" (a mais recente), em vez de "a sessão de hoje" no singular — decisão explícita do
   * usuário (21/11/2026): o lançamento pertence ao turno em que o evento realmente aconteceu.
   */
  private async findLatestClosedSessionToday(restaurantId: string) {
    const todayClosedSessions = await this.cashRegisterRepository.findClosedSessionsForDate(restaurantId, cashRegisterDate());
    return todayClosedSessions[todayClosedSessions.length - 1];
  }

  private async recordPartialRefundEntry(sessionId: string, input: AutomaticCashEntryInput): Promise<void> {
    const methodLabel = PAYMENT_LABEL[input.paymentMethod] ?? input.paymentMethod;
    await this.cashRegisterRepository.addMovement(sessionId, {
      type: 'saida',
      amount: input.amount,
      description: `Troco a devolver - Mesa/balcão #${input.orderNumber} (${methodLabel})`,
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
      paymentId: input.paymentId,
    });
  }

  private async openSessionForFirstSale(restaurantId: string): Promise<{ id: string } | null> {
    try {
      return await this.cashRegisterRepository.open(restaurantId, 0, AUTOMATIC_ACTOR, true);
    } catch (error) {
      // Corrida: duas vendas chegaram juntas e a outra já abriu uma sessão (specs/0219 — o
      // conflito agora é sobre "existe sessão aberta", não mais sobre "existe sessão desta
      // data", então a recuperação busca a sessão aberta, não a de hoje no singular).
      const existing = await this.cashRegisterRepository.findOpenSessionByRestaurant(restaurantId);
      if (existing) return existing;
      throw error;
    }
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
        ? `Mesa/balcão${input.isPartialPayment ? ' - pagamento parcial' : ''} #${input.orderNumber} (${methodLabel})`
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
      // specs/0213-caixa-pix-na-confirmacao REQ-7 — Pix não entra mais aqui (gatilho é
      // "confirmado", tratado no loop abaixo); as demais formas continuam por "entregue".
      if (order.status !== 'entregue' || isPaidBeforeDelivery(order)) continue; // specs/0234: + cartão online do app
      await this.recordAutomaticEntry(session.id, {
        restaurantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.total,
        paymentMethod: order.paymentMethod,
      });
    }

    // specs/0213-caixa-pix-na-confirmacao REQ-7 — recria a entrada automática de pedidos Pix que
    // passaram por "confirmado" dentro do período desta sessão. Pedido já cancelado depois de
    // confirmado fica de fora por simplicidade (limitação conhecida, documentada em `plan.md`):
    // o par entrada+estorno já deveria existir de quando o cancelamento aconteceu ao vivo; esta
    // reconstrução cobre só a entrada "solta" de um pedido ainda em andamento ou já entregue.
    const paidBeforeDeliveryOrders = await this.orderRepository.findPaidBeforeDeliverySalesBetween(restaurantId, from, to);
    for (const order of paidBeforeDeliveryOrders) {
      if (order.status === 'cancelado') continue;
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
      // Ajuste explícito do usuário (02/11/2026) — nunca abre a data atual (nem automático, nem
      // manual) enquanto uma data anterior segue aberta sem fechamento; checa ANTES de chamar
      // `open()` pra nunca propagar o `ConflictError` do repositório daqui (essa função roda em
      // toda leitura de `GET .../open`, nunca pode quebrar a página só por haver pendência —
      // `pendingSessions`, já devolvido nessa mesma resposta, é quem avisa o operador).
      const hasStuckOpenSession = (await this.cashRegisterRepository.findPendingSessions(restaurantId)).length > 0;
      if (hasStuckOpenSession) return;
      try {
        await this.cashRegisterRepository.open(restaurantId, 0, AUTOMATIC_ACTOR, true, now);
      } catch (error) {
        // Outra requisição pode ter aberto o mesmo caixa enquanto consultávamos.
        if (!(await this.cashRegisterRepository.findSessionByDate(restaurantId, cashRegisterDate(now)))) throw error;
      }
      return;
    }

    // Fechamento reativo (igual abertura acima) nunca acontece aqui — ver
    // `closeDueAutomaticSessions` abaixo (specs/0216), chamada por um worker periódico
    // (`cash-register-auto-close-worker.ts`), não por esta checagem reativa. Fechamento
    // automático é tipicamente de madrugada (default 04:00); um mecanismo reativo deixaria a
    // sessão presa até alguém abrir a tela de manhã, nem sempre batendo com o horário
    // configurado — diferente da abertura, que já tem um gatilho natural (primeiro acesso do
    // dia).
  }

  /**
   * specs/0216-fechamento-automatico-caixa REQ-3/REQ-5/REQ-6/REQ-7 — chamada pelo worker
   * periódico `cash-register-auto-close-worker.ts`, nunca por uma rota HTTP. Cada restaurante
   * falha isoladamente (mesmo raciocínio de `IFoodPollingWorker.run`): um erro num restaurante
   * nunca impede o fechamento dos demais.
   */
  async closeDueAutomaticSessions(now: Date = new Date()): Promise<void> {
    const restaurants = await this.restaurantRepository.listAll();
    const due = restaurants.filter((restaurant) => restaurant.cashRegisterAutoCloseMode === 'automatic');
    for (const restaurant of due) {
      try {
        await this.closeDueAutomaticSessionForRestaurant(restaurant, now);
      } catch (error) {
        console.error(`[financeiro] erro inesperado no fechamento automático de caixa do restaurante ${restaurant.id}:`, error);
      }
    }
  }

  /**
   * Achado real de produção (21/11/2026) — usava `findOpenSessionByRestaurant` (escopado à data
   * de HOJE); uma sessão deixada aberta de um dia anterior (ninguém acessou nenhuma tela do
   * caixa pra disparar a abertura reativa do dia seguinte) nunca aparecia nessa busca —
   * "hoje" nunca bate com a `businessDate` de uma sessão presa, então o worker rodava a cada 5min
   * sem achar nada pra fechar, pra sempre, sem erro nenhum. `findPendingSessions` busca por
   * `status: 'aberto'` puro, qualquer data (a invariante de "só 1 sessão aberta por vez" garante
   * no máximo 1 resultado) — enxerga a sessão travada de verdade.
   */
  private async closeDueAutomaticSessionForRestaurant(restaurant: IRestaurant, now: Date): Promise<void> {
    const session = (await this.cashRegisterRepository.findPendingSessions(restaurant.id))[0];
    if (!session) return;
    // REQ-6 — uma sessão que o dono reabriu manualmente (`reopenedAt`) fica fora do fechamento
    // automático: reabrir é um sinal explícito de "quero fazer a conferência física eu mesmo
    // agora", e fechar de novo sozinha no próximo tick (minutos depois) tiraria exatamente a
    // chance que REQ-6 promete. Essa sessão só volta a fechar por ação manual do dono.
    if (session.reopenedAt) return;

    // specs/0216 T009 — fecha quando chega o PRIMEIRO horário configurado DEPOIS da abertura da
    // sessão. Antes comparava só "hora atual >= horário" pra sessão de hoje: com o default 04:00
    // (madrugada, REQ-2), toda sessão aberta de dia já estava "vencida" e fechava no tick seguinte
    // do worker (achado real: 09:23 → 09:26 e 15:32 → 15:33); e a de ontem fechava à meia-noite
    // (troca de data), não às 04:00. Sessão esquecida há dias continua fechando no próximo tick
    // (o horário dela já passou faz tempo).
    const closeTime = restaurant.cashRegisterAutoCloseTime || '04:00';
    if (now.getTime() < nextAutoCloseAt(new Date(session.openedAt), closeTime).getTime()) return;

    const calculatedBalance = await this.cashRegisterRepository.getCalculatedBalance(session.id);
    await this.cashRegisterRepository.close(session.id, calculatedBalance, AUTOMATIC_ACTOR, true);
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
    // (achado real, pedido explícito do usuário) — mesmo recorte mesa/balcão vs. delivery/
    // retirada já exposto em "Movimento do dia" (`getTableSalesBetween`/`getDeliverySalesBetween`),
    // calculado aqui em cima do mesmo `orders` já buscado acima, sem round-trip extra ao banco.
    let tableSales = 0;
    let deliverySales = 0;
    for (const order of orders) {
      if (order.orderType === 'table') {
        for (const payment of order.tablePayments ?? []) {
          const paidAt = new Date(payment.paidAt);
          if (paidAt < new Date(session.openedAt) || paidAt >= periodEnd) continue;
          const method = payment.method as PaymentMethod;
          tableSales += payment.amount;
          if (!(method in salesByPaymentMethod)) continue;
          salesByPaymentMethod[method] += payment.amount;
          totalSales += payment.amount;
        }
        continue;
      }
      // specs/0213-caixa-pix-na-confirmacao REQ-6 — Pix some daqui (fica por conta do loop
      // abaixo, que conta pelo momento de "confirmado", não de "entregue").
      if (order.status !== 'entregue' || isPaidBeforeDelivery(order)) continue; // specs/0234: + cartão online do app
      salesByPaymentMethod[order.paymentMethod] += order.total;
      totalSales += order.total;
      deliverySales += order.total;
    }

    // specs/0213-caixa-pix-na-confirmacao REQ-6 — pedidos Pix contam pelo momento em que
    // passaram por "confirmado" dentro do período (onde o lançamento automático de REQ-1
    // acontece), independente do status atual. Cancelado depois de confirmado soma zero (entrada
    // + estorno se cancelam no ledger real — ambos os movimentos têm `orderId`, então nenhum dos
    // dois é somado de novo no loop de movimentos manuais logo abaixo; não somar aqui mantém o
    // total batendo com o ledger).
    const paidBeforeDeliveryOrders = await this.orderRepository.findPaidBeforeDeliverySalesBetween(
      session.restaurantId,
      new Date(session.openedAt),
      periodEnd,
    );
    for (const order of paidBeforeDeliveryOrders) {
      if (order.status === 'cancelado') continue;
      salesByPaymentMethod[order.paymentMethod] += order.total; // specs/0234: Pix ou cartão online
      totalSales += order.total;
      deliverySales += order.total;
    }

    const balanceByPaymentMethod: Record<PaymentMethod, number> = { ...salesByPaymentMethod };
    const movements = await this.cashRegisterRepository.listMovements(sessionId);
    for (const movement of movements) {
      if (movement.orderId) continue;
      if (session.closedAt && new Date(movement.createdAt) > new Date(session.closedAt)) continue;
      // specs/0208-redesign-movimento-caixa (ajuste 08/11/2026, pedido explícito do usuário) —
      // lançamento manual agora pode informar a forma de pagamento (combobox no diálogo "Lançar
      // movimento"); sem ela, continua contando como dinheiro (comportamento de sempre).
      const method = (movement.paymentMethod as PaymentMethod | undefined) ?? 'cash';
      if (!(method in balanceByPaymentMethod)) continue;
      balanceByPaymentMethod[method] += movement.type === 'entrada' ? movement.amount : -movement.amount;
    }

    const calculatedBalance = await this.cashRegisterRepository.getCalculatedBalance(sessionId);
    const difference = session.closingBalance !== undefined ? session.closingBalance - calculatedBalance : 0;

    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — venda automática lançada
    // num caixa já fechado (`addAutomaticEntry`, caso 2 do cabeçalho daquele método) fica de fora
    // da conferência acima (`calculatedBalance`/`difference`/`totalSales`/`tableSales`/
    // `deliverySales`/`balanceByPaymentMethod` continuam exatamente como estavam no momento do
    // fechamento, nunca mudam retroativamente) — mas nunca fica escondida: aparece aqui, separada,
    // pra quem olha o histórico ver claramente que entrou depois. Some sozinha dessa lista (e volta
    // a contar na conferência normal) se o caixa for reaberto — `reopen()` limpa `closedAt`, então
    // a comparação abaixo deixa de achar qualquer lançamento "tardio".
    const lateMovements = session.closedAt
      ? movements.filter((movement) => new Date(movement.createdAt) > new Date(session.closedAt!))
      : [];

    return { session, balanceByPaymentMethod, totalSales, calculatedBalance, difference, tableSales, deliverySales, lateMovements };
  }
}
