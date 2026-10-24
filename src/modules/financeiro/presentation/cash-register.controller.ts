import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
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
 * `openedBy`/`closedBy` usam `req.user!.uid` (id do operador no Firebase, mesma fonte de
 * `RestaurantOperator`, specs/0007) — diferente do `changedBy` de `OrdersController`, que usa
 * `req.restaurantId` por decisão daquele módulo; aqui o dado que a spec pede
 * (`docs/architecture/data-model.md`, "id do operador") está disponível em `req.user`, então é
 * esse que é gravado.
 */
export class CashRegisterController extends BaseRouter {
  constructor(
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly orderRepository: IOrderRepository,
    // specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule` (REQ-3/REQ-4/
    // REQ-6) chamado no início de toda rota abaixo que lê ou muda o caixa (ver `plan.md`).
    private readonly cashRegisterService: ICashRegisterService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
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
      const pendingSessions = await this.cashRegisterRepository.findPendingSessions(req.restaurantId!);
      if (!session) {
        const todaySession = await this.cashRegisterRepository.findSessionByDate(req.restaurantId!, cashRegisterDate());
        res.json(200, { session: null, pendingSessions, todaySession, movements: [], calculatedBalance: 0, tableSales: 0, balanceByPaymentMethod: {} });
        return;
      }
      const [movements, calculatedBalance, tableSales, balanceByPaymentMethod] = await Promise.all([
        this.cashRegisterRepository.listMovements(session.id),
        this.cashRegisterRepository.getCalculatedBalance(session.id),
        this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
        this.cashRegisterService.getBalanceByPaymentMethod(session.id),
      ]);
      res.json(200, { session, pendingSessions, movements, calculatedBalance, tableSales, balanceByPaymentMethod });
    });

    // AC-4/AC-8 — REQ-8: bloqueia se já houver sessão aberta, indicando qual é.
    application.post('/restaurants/me/cash-register/open', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      const { openingBalance } = parseBody(openCashRegisterSchema, req.body);
      const existing = await this.cashRegisterRepository.findSessionByDate(req.restaurantId!, cashRegisterDate());
      if (existing) {
        throw new ConflictError(
          `Já existe uma sessão de caixa para esta data desde ${existing.openedAt} (id ${existing.id})`,
        );
      }
      const session = await this.cashRegisterRepository.open(req.restaurantId!, openingBalance, req.user?.uid);
      res.json(201, session);
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
        if ((session.businessDate ?? cashRegisterDate(new Date(session.openedAt))) !== cashRegisterDate()) {
          throw new BadRequestError('Lançamentos só podem ser feitos no caixa da data atual');
        }
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
        const result = await this.cashRegisterRepository.close(session.id, countedValue, req.user?.uid);
        const tableSales = await this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session));
        res.json(200, { ...result, tableSales });
      },
    );

    // REQ-10 — histórico de fechamentos no período, com o resumo (saldo por forma de pagamento,
    // total de vendas, abertura/fechamento calculado vs. contado) de cada um.
    application.get('/restaurants/me/cash-register/history', ...authenticated, async (req: Request, res: Response) => {
      await this.cashRegisterService.ensureAutomaticSchedule(req.restaurantId!);
      const { from, to } = parseBody(cashRegisterPeriodSchema, req.query);
      const sessions = await this.cashRegisterRepository.findClosedSessionsBetween(req.restaurantId!, new Date(from), new Date(to));
      const closings = await Promise.all(sessions.map((session) => this.cashRegisterService.getClosingSummary(session.id)));
      res.json(200, { from, to, closings });
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
      const [movements, calculatedBalance, balanceByPaymentMethod, pendingSessions, tableSales] = await Promise.all([
        this.cashRegisterRepository.listMovements(session.id),
        this.cashRegisterRepository.getCalculatedBalance(session.id),
        this.cashRegisterService.getBalanceByPaymentMethod(session.id),
        this.cashRegisterRepository.findPendingSessions(req.restaurantId!),
        this.orderRepository.getTableSalesBetween(req.restaurantId!, new Date(session.openedAt), cashRegisterPeriodEnd(session)),
      ]);
      res.json(200, { session, pendingSessions, movements, calculatedBalance, balanceByPaymentMethod, tableSales });
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
