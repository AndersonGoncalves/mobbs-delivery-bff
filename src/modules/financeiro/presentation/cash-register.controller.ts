import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { addCashMovementSchema, closeCashRegisterSchema, motoboyPayoutPeriodSchema, openCashRegisterSchema } from './financeiro.schemas';

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
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-4/T006 — financeiro é `dono`/`financeiro` (sem `gerente`).
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'financeiro'),
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

    // REQ-4/REQ-6 — devolve a sessão aberta (ou `null`, estado válido de "sem caixa aberto"),
    // junto dos movimentos e do saldo calculado ao vivo, pra tela de caixa montar tudo numa
    // única chamada.
    application.get('/restaurants/me/cash-register/open', ...authenticated, async (req: Request, res: Response) => {
      const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
      if (!session) {
        res.json(200, { session: null, movements: [], calculatedBalance: 0 });
        return;
      }
      const [movements, calculatedBalance] = await Promise.all([
        this.cashRegisterRepository.listMovements(session.id),
        this.cashRegisterRepository.getCalculatedBalance(session.id),
      ]);
      res.json(200, { session, movements, calculatedBalance });
    });

    // AC-4/AC-8 — REQ-8: bloqueia se já houver sessão aberta, indicando qual é.
    application.post('/restaurants/me/cash-register/open', ...authenticated, async (req: Request, res: Response) => {
      const { openingBalance } = parseBody(openCashRegisterSchema, req.body);
      const existing = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
      if (existing) {
        throw new ConflictError(
          `Já existe uma sessão de caixa aberta desde ${existing.openedAt} (id ${existing.id})`,
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
        const payload = parseBody(addCashMovementSchema, req.body);
        const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
        if (session.status !== 'aberto') {
          throw new BadRequestError('Sessão de caixa já está fechada');
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
        const { countedValue } = parseBody(closeCashRegisterSchema, req.body);
        const session = await this.findOwnedSession(req.params.id, req.restaurantId!);
        if (session.status !== 'aberto') {
          throw new BadRequestError('Sessão de caixa já está fechada');
        }
        const result = await this.cashRegisterRepository.close(session.id, countedValue, req.user?.uid);
        res.json(200, result);
      },
    );
  }

  private async findOwnedSession(id: string, restaurantId: string) {
    const session = await this.cashRegisterRepository.findById(id);
    if (!session || session.restaurantId !== restaurantId) {
      throw new NotFoundError('Sessão de caixa não encontrada');
    }
    return session;
  }
}
