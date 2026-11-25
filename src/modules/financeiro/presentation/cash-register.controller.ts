import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole, requireOwnerRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { ICashRegisterSession } from '../domain/entities/cash-register.entity';
import { ICashRegisterService } from '../domain/services/i-cash-register.service';
import { cashRegisterDate, cashRegisterPeriodEnd } from '../domain/cash-register-date';
import {
  addCashMovementSchema,
  cashRegisterPeriodSchema,
  closeCashRegisterSchema,
  motoboyPayoutPeriodSchema,
  openCashRegisterSchema,
} from './financeiro.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0014-financeiro REQ-4/REQ-6/REQ-7/REQ-8 — caixa do restaurante do operador logado.
 * specs/0220-operador-no-fechamento-caixa — `openedBy`/`closedBy`/`reopenedBy` gravam
 * `req.operatorId` (id do `RestaurantOperator`, mesmo padrão de `deliveryMotoboy` em
 * `OrdersController`), não mais `req.user!.uid` (UID do Firebase, sem nenhum jeito de resolver
 * pra nome depois — era a inconsistência original).
 */
export class CashRegisterController extends BaseRouter {
  constructor(
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly orderRepository: IOrderRepository,
    // specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule` (REQ-3/REQ-4/
    // REQ-6) chamado no início de toda rota abaixo que lê ou muda o caixa (ver `plan.md`).
    private readonly cashRegisterService: ICashRegisterService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // specs/0220-operador-no-fechamento-caixa REQ-2 — resolve `openedBy`/`closedBy`/`reopenedBy`
    // (id do operador) pra nome/e-mail antes de responder.
    private readonly restaurantOperatorRepository: IRestaurantOperatorRepository,
  ) {
    super();
  }

  /** specs/0220-operador-no-fechamento-caixa REQ-2 — resolve em lote (`findManyByIds`, mesmo
   * padrão de `deliveryMotoboy` em `OrdersController`), ignorando aberturas/fechamentos
   * automáticos (`openedAutomatically`/`closedAutomatically` — rotulados "Automático" sem
   * precisar resolver nada) e ids que não correspondem a nenhum operador (dado legado, UID do
   * Firebase gravado antes desta spec — resolve pra `null`, nunca erro). */
  private async resolveOperatorNames(sessions: ICashRegisterSession[]): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.openedBy && !session.openedAutomatically) ids.add(session.openedBy);
      if (session.closedBy && !session.closedAutomatically) ids.add(session.closedBy);
      if (session.reopenedBy) ids.add(session.reopenedBy);
    }
    if (ids.size === 0) return new Map();
    const operators = await this.restaurantOperatorRepository.findManyByIds([...ids]);
    return new Map(operators.map((operator) => [operator.id, operator.name || operator.email]));
  }

  private withOperatorNames(session: ICashRegisterSession, names: Map<string, string>) {
    const resolve = (id?: string) => (id ? names.get(id) ?? null : null);
    return {
      ...session,
      openedByName: session.openedAutomatically ? 'Automático' : resolve(session.openedBy),
      closedByName: session.closedAutomatically ? 'Automático' : resolve(session.closedBy),
      reopenedByName: resolve(session.reopenedBy),
    };
  }

  initializeRoutes(application: Server): void {
    // Movimento e repasses de caixa: dono, gerente e caixa.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    // specs/0127 — relatório somente leitura; repassa integralmente deliveryFee de pedidos delivery
    // concluídos no intervalo e atribuídos a um motoboy.
    application.get('/restaurants/me/cash-register/motoboy-payouts', ...authenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(motoboyPayoutPeriodSchema, req.query);
      const orders = await this.orderRepository.findDeliveredByRestaurantCompletedBetween(
        req.restaurantId!,
        new Date(from),
        new Date(to),
      );
      const grouped = new Map<
        string,
        { motoboyId: string; motoboyName: string; orderCount: number; totalDue: number; orders: { orderId: string; orderNumber: number; deliveredAt: string; deliveryFee: number }[] }
      >();
      let unassignedOrderCount = 0;
      let unassignedDeliveryFees = 0;

      for (const order of orders) {
        const deliveredAt = order.statusHistory.find((entry) => entry.status === 'entregue')?.changedAt;
        if (!deliveredAt) continue;
        if (!order.deliveryMotoboy) {
          unassignedOrderCount += 1;
          unassignedDeliveryFees += order.deliveryFee;
          continue;
        }
        const motoboyId = order.deliveryMotoboy.id;
        const summary = grouped.get(motoboyId) ?? {
          motoboyId,
          motoboyName: order.deliveryMotoboy.name,
          orderCount: 0,
          totalDue: 0,
          orders: [],
        };
        summary.orderCount += 1;
        summary.totalDue += order.deliveryFee;
        summary.orders.push({ orderId: order.id, orderNumber: order.orderNumber, deliveredAt, deliveryFee: order.deliveryFee });
        grouped.set(motoboyId, summary);
      }

      const motoboys = [...grouped.values()].sort((first, second) => first.motoboyName.localeCompare(second.motoboyName));
      res.json(200, {
        from,
        to,
        totalDue: motoboys.reduce((total, motoboy) => total + motoboy.totalDue, 0),
        motoboys,
        unassignedOrderCount,
        unassignedDeliveryFees,
      });
    });

    // specs/0136-repasses-garcons — relatório somente leitura, mesmo padrão de REQ acima
    // (motoboy-payouts), mas somando `serviceChargeAmount` dos pedidos de mesa fechados
    // (`findClosedTableOrders`) agrupados por `tableWaiter`.
    application.get('/restaurants/me/cash-register/waiter-payouts', ...authenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(motoboyPayoutPeriodSchema, req.query);
      const orders = await this.orderRepository.findClosedTableOrders(req.restaurantId!, new Date(from), new Date(to));
      const grouped = new Map<
        string,
        { waiterId: string; waiterName: string; orderCount: number; totalDue: number; orders: { orderId: string; orderNumber: number; closedAt: string; serviceChargeAmount: number }[] }
      >();
      let unassignedOrderCount = 0;
      let unassignedServiceCharges = 0;

      for (const order of orders) {
        const closedAt = order.tableClosedAt;
        if (!closedAt) continue;
        const serviceChargeAmount = order.serviceChargeAmount ?? 0;
        if (!order.tableWaiter) {
          unassignedOrderCount += 1;
          unassignedServiceCharges += serviceChargeAmount;
          continue;
        }
        const waiterId = order.tableWaiter.id;
        const summary = grouped.get(waiterId) ?? {
          waiterId,
          waiterName: order.tableWaiter.name,
          orderCount: 0,
          totalDue: 0,
          orders: [],
        };
        summary.orderCount += 1;
        summary.totalDue += serviceChargeAmount;
        summary.orders.push({ orderId: order.id, orderNumber: order.orderNumber, closedAt, serviceChargeAmount });
        grouped.set(waiterId, summary);
      }

      const waiters = [...grouped.values()].sort((first, second) => first.waiterName.localeCompare(second.waiterName));
      res.json(200, {
        from,
        to,
        totalDue: waiters.reduce((total, waiter) => total + waiter.totalDue, 0),
        waiters,
        unassignedOrderCount,
        unassignedServiceCharges,
      });
    });

    // REQ-4/REQ-6/REQ-9 — devolve a sessão aberta (ou `null`, estado válido de "sem caixa
    // aberto"), junto dos movimentos, do saldo calculado ao vivo e do saldo por forma de
    // pagamento (REQ-9), pra tela de caixa montar tudo numa única chamada.
    application.get('/restaurants/me/cash-register/open', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      await this.cashRegisterService.syncOpenSession(req.restaurantId!);
      const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
      // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
      // `findPendingSessions` (qualquer sessão `aberto`, qualquer data) incluía a própria sessão
      // de hoje quando ela existia, fazendo ela aparecer duplicada no seletor "Caixa para
      // conferência" (uma vez como "Caixa aberto Atual", outra como "Pendente de fechamento" —
      // a mesma sessão, duas entradas). "Pendente de fechamento" deve significar só uma sessão
      // presa de OUTRA data, nunca a sessão normal de hoje.
      const pendingSessions = (await this.cashRegisterRepository.findPendingSessions(req.restaurantId!))
        .filter((pending) => pending.id !== session?.id);
      // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
      // lista TODAS as sessões fechadas de hoje, pra alimentar o seletor "Caixa para
      // conferência" (web); calculado ANTES do `if (!session)` (não só dentro dele) — senão some
      // do combobox assim que existir uma sessão aberta de novo.
      const todayClosedSessions = await this.cashRegisterRepository.findClosedSessionsForDate(req.restaurantId!, cashRegisterDate());
      // specs/0220-operador-no-fechamento-caixa REQ-2 — resolve o(s) operador(es) de todas as
      // sessões que vão pro seletor "Caixa para conferência" numa chamada só.
      const operatorNames = await this.resolveOperatorNames([...(session ? [session] : []), ...pendingSessions, ...todayClosedSessions]);
      const withNames = (list: ICashRegisterSession[]) => list.map((item) => this.withOperatorNames(item, operatorNames));
      if (!session) {
        res.json(200, {
          session: null,
          pendingSessions: withNames(pendingSessions),
          todayClosedSessions: withNames(todayClosedSessions),
          movements: [], calculatedBalance: 0, tableSales: 0, deliverySales: 0, balanceByPaymentMethod: {},
        });
        return;
      }
      const [movements, calculatedBalance, tableSales, deliverySales, balanceByPaymentMethod] = await Promise.all([
        this.cashRegisterRepository.listMovements(session.id),
        this.cashRegisterRepository.getCalculatedBalance(session.id),
        this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
        this.orderRepository.getDeliverySalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
        this.cashRegisterService.getBalanceByPaymentMethod(session.id),
      ]);
      res.json(200, {
        session: this.withOperatorNames(session, operatorNames),
        pendingSessions: withNames(pendingSessions),
        todayClosedSessions: withNames(todayClosedSessions),
        movements, calculatedBalance, tableSales, deliverySales, balanceByPaymentMethod,
      });
    });

    // AC-4/AC-8 — REQ-8: bloqueia se já houver sessão aberta, indicando qual é. specs/0219 —
    // deixou de checar "já existe sessão desta data" (bloqueava abrir de novo no mesmo dia depois
    // de um fechamento); `open()` (repository) já lança `ConflictError` se houver sessão aberta.
    application.post('/restaurants/me/cash-register/open', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      const { openingBalance } = parseBody(openCashRegisterSchema, req.body);
      try {
        const session = await this.cashRegisterRepository.open(req.restaurantId!, openingBalance, req.operatorId);
        res.json(201, session);
      } catch (error) {
        // Achado real (23/11/2026) — em restaurantes com `cashRegisterMode: 'automatic'`, o
        // `ensureAutomaticSchedule` acima já pode ter aberto a sessão de hoje alguns milissegundos
        // antes desta mesma requisição tentar abrir de novo manualmente, batendo no índice único e
        // devolvendo um `ConflictError` genérico (sem id/data) só porque o próprio request se
        // autoconflitou — não porque o usuário tentou abrir um caixa que já estava aberto antes do
        // clique. `findOpenSessionByRestaurant` só enxerga a sessão de HOJE (nunca uma pendente de
        // dia anterior — ver comentário no repository), então nesse caso específico devolvemos a
        // sessão que acabou de ser aberta como sucesso. Pendência de dia anterior continua
        // propagando o erro normalmente (AC-8), pois não há sessão aberta hoje pra encontrar aqui.
        const openToday = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
        if (!openToday) throw error;
        res.json(200, openToday);
      }
    });

    // AC-6 — lançamento manual (entrada ou saída), só numa sessão aberta e do próprio restaurante.
    application.post(
      '/restaurants/me/cash-register/:id/movements',
      ...authenticated,
      async (req: Request, res: Response) => {
        await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
        const payload = parseBody(addCashMovementSchema, req.body);
        const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
        if (session.status !== 'aberto') {
          throw new BadRequestError('Sessão de caixa já está fechada');
        }
        // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — recusava lançamento
        // manual num caixa aberto de uma data civil diferente de hoje (spec 0176); bloqueava até
        // um lançamento manual legítimo (ex. sangria) num caixa aberto a noite anterior, ainda não
        // fechado, só porque o relógio virou meia-noite. "Sessão está aberta" já é a checagem
        // certa — mesmo raciocínio de `addAutomaticEntry` (`cash-register.service.ts`).
        const movement = await this.cashRegisterRepository.addMovement(session.id, payload);
        res.json(201, movement);
      },
    );

    // AC-7 — mostra a diferença entre o saldo calculado e o valor contado, registrando os dois.
    application.post(
      '/restaurants/me/cash-register/:id/close',
      ...authenticated,
      async (req: Request, res: Response) => {
        await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
        const { countedValue } = parseBody(closeCashRegisterSchema, req.body);
        const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
        if (session.status !== 'aberto') {
          throw new BadRequestError('Sessão de caixa já está fechada');
        }
        await this.cashRegisterService.syncOpenSession(req.restaurantId!, session.id);
        const result = await this.cashRegisterRepository.close(session.id, countedValue, req.operatorId);
        const tableSales = await this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session));
        const deliverySales = await this.orderRepository.getDeliverySalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session));
        res.json(200, { ...result, tableSales, deliverySales });
      },
    );

    // Ajuste explícito do usuário (02/11/2026) — só o dono pode reabrir um caixa já fechado
    // (`requireOwnerRole()`, encadeado depois de `authenticated`: gerente/financeiro passam no
    // primeiro filtro e são barrados neste). Bloqueia se já existir outra sessão aberta — reabrir
    // uma data antiga nunca pode coexistir com uma sessão em aberto de outra data (mesma
    // invariante de `open()`, "nunca mais de um caixa aberto por vez").
    application.post(
      '/restaurants/me/cash-register/:id/reopen',
      ...authenticated,
      requireOwnerRole(),
      async (req: Request, res: Response) => {
        const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
        if (session.status !== 'fechado') {
          throw new BadRequestError('Só é possível reabrir um caixa já fechado');
        }
        const openSessions = await this.cashRegisterRepository.findPendingSessions(req.restaurantId!);
        if (openSessions.length > 0) {
          throw new ConflictError(
            `Existe um caixa aberto desde ${openSessions[0].businessDate ?? cashRegisterDate(new Date(openSessions[0].openedAt))} — feche-o antes de reabrir outro.`,
          );
        }
        const reopened = await this.cashRegisterRepository.reopen(session.id, req.operatorId);
        res.json(200, reopened);
      },
    );

    // REQ-10 — histórico de fechamentos no período, com o resumo (saldo por forma de pagamento,
    // total de vendas, abertura/fechamento calculado vs. contado) de cada um.
    application.get('/restaurants/me/cash-register/history', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      const { from, to } = parseBody(cashRegisterPeriodSchema, req.query);
      const sessions = await this.cashRegisterRepository.findClosedSessionsBetween(req.restaurantId!, new Date(from), new Date(to));
      const closings = await Promise.all(sessions.map((session) => this.cashRegisterService.getClosingSummary(session.id)));
      // specs/0220-operador-no-fechamento-caixa REQ-2/REQ-3 — resolve quem fechou cada sessão do
      // relatório de Movimento de Caixa.
      const operatorNames = await this.resolveOperatorNames(closings.map((closing) => closing.session));
      const closingsWithOperator = closings.map((closing) => ({
        ...closing,
        session: this.withOperatorNames(closing.session, operatorNames),
      }));
      res.json(200, { from, to, closings: closingsWithOperator });
    });

    // (ajuste, pedido explícito do usuário) — era só manuais (REQ-11 original); "Entradas e
    // saídas" do Histórico escondia as vendas automáticas (mesa/balcão, delivery) do período,
    // mostrando só sangria/suprimento. Agora todo `CashMovementEntry` do período, manual ou
    // automático.
    application.get('/restaurants/me/cash-register/movements', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      const { from, to } = parseBody(cashRegisterPeriodSchema, req.query);
      const movements = await this.cashRegisterRepository.findMovementsByRestaurantBetween(
        req.restaurantId!,
        new Date(from),
        new Date(to),
      );
      res.json(200, { from, to, movements });
    });

    application.get('/restaurants/me/cash-register/:id', ...authenticated, async (req: Request, res: Response) => {
      const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
      await this.cashRegisterService.syncOpenSession(req.restaurantId!, session.id);
      // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
      // faltava `todayClosedSessions` aqui (só `GET .../open` devolvia): ao selecionar qualquer
      // sessão no seletor "Caixa para conferência", a lista de sessões fechadas de hoje sumia do
      // combobox, só reaparecendo depois de voltar pra "Caixa aberto agora".
      const [movements, calculatedBalance, balanceByPaymentMethod, openSession, pendingSessionsRaw, todayClosedSessions, tableSales, deliverySales] = await Promise.all([
        this.cashRegisterRepository.listMovements(session.id),
        this.cashRegisterRepository.getCalculatedBalance(session.id),
        this.cashRegisterService.getBalanceByPaymentMethod(session.id),
        this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!),
        this.cashRegisterRepository.findPendingSessions(req.restaurantId!),
        this.cashRegisterRepository.findClosedSessionsForDate(req.restaurantId!, cashRegisterDate()),
        this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
        this.orderRepository.getDeliverySalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
      ]);
      // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
      // mesmo ajuste de `GET .../open`: a sessão aberta de hoje nunca deve aparecer duplicada
      // como "Pendente de fechamento" (`openSession`, não `session` — aqui `session` é a
      // selecionada no seletor, que pode ser outra sessão qualquer, não necessariamente a aberta).
      const pendingSessions = pendingSessionsRaw.filter((pending) => pending.id !== openSession?.id);
      // specs/0220-operador-no-fechamento-caixa REQ-2 — mesma resolução de `GET .../open`.
      const operatorNames = await this.resolveOperatorNames([session, ...pendingSessions, ...todayClosedSessions]);
      res.json(200, {
        session: this.withOperatorNames(session, operatorNames),
        pendingSessions: pendingSessions.map((item) => this.withOperatorNames(item, operatorNames)),
        todayClosedSessions: todayClosedSessions.map((item) => this.withOperatorNames(item, operatorNames)),
        movements, calculatedBalance, balanceByPaymentMethod, tableSales, deliverySales,
      });
    });
  }

  private async findOwnedSession(id: string, restaurantId: string) {
    const session = await this.cashRegisterRepository.findById(id);
    if (!session || session.restaurantId !== restaurantId) {
      throw new NotFoundError('Sessão de caixa não encontrada');
    }
    return session;
  }
}
