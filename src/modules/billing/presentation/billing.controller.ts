import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { computeBillingTier, defaultBilling, monthKeyOf, monthRange, priceCents, sumRevenueCents, tierLimitCents } from '../domain/billing';
import type { IBillingSettingsRepository } from '../domain/repositories/billing-settings.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0042 REQ-5/REQ-6 — card de faturamento do mês e extrato dos pedidos contabilizados. Restrito ao
 * `dono`: é informação financeira do restaurante.
 */
export class BillingController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // specs/0113-parametrizacao-faixas-cobranca.
    private readonly billingSettingsRepository: IBillingSettingsRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware, requireOperatorRole('dono')];

    application.get('/restaurants/me/billing', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      const settings = await this.billingSettingsRepository.get();
      const month = monthKeyOf(new Date());
      const { start, end } = monthRange(month);
      const orders = await this.orderRepository.findDeliveredByRestaurantBetween(restaurant.id, start, end);
      const revenueCents = sumRevenueCents(orders);
      const tier = computeBillingTier(revenueCents, settings);
      const billing = restaurant.billing ?? defaultBilling(month);
      const limitCents = tier === 'premium' ? null : tierLimitCents(tier, settings);
      const percent = limitCents ? Math.min(100, Math.round((revenueCents / limitCents) * 1000) / 10) : null;
      res.json(200, {
        referenceMonth: month,
        tier,
        cycle: billing.cycle,
        status: billing.status,
        revenueCents,
        limitCents,
        percent,
        monthlyPriceCents: priceCents(tier, 'monthly', settings),
        annualPriceCents: priceCents(tier, 'annual', settings),
      });
    });

    application.get('/restaurants/me/billing/orders', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const month = monthKeyOf(new Date());
      const { start, end } = monthRange(month);
      const orders = await this.orderRepository.findDeliveredByRestaurantBetween(req.restaurantId!, start, end);
      res.json(200, {
        revenueCents: sumRevenueCents(orders),
        orders: orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, total: order.total, createdAt: order.createdAt })),
      });
    });
  }
}
