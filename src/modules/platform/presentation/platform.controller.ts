import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';
import { z } from 'zod';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';
import { computeBillingTier, defaultBilling, isBillingBlocked, monthKeyOf, monthRange, sumRevenueCents } from '../../billing/domain/billing';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const billingChangeSchema = z
  .object({
    status: z.enum(['ok', 'blocked']).optional(),
    cycle: z.enum(['monthly', 'annual']).optional(),
  })
  .refine((value) => value.status !== undefined || value.cycle !== undefined, { message: 'Informe status e/ou ciclo' });

/** specs/0106 — linha do painel: um restaurante com o estado de cobrança do mês. */
export interface PlatformRestaurantRow {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pro' | 'premium';
  status: 'ok' | 'blocked';
  cycle: 'monthly' | 'annual';
  revenueCents: number;
  lastDeliveredAt: string | null;
  blocked: boolean;
}

/**
 * specs/0106 REQ-2/REQ-3/REQ-4 — painel da plataforma: lista de restaurantes e troca de status/ciclo.
 * Protegido por `platformAdminMiddleware` (REQ-1), que o chamador encadeia.
 */
export class PlatformController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  private async buildRow(restaurant: IRestaurant, month: string): Promise<PlatformRestaurantRow> {
    const { start, end } = monthRange(month);
    const orders = await this.orderRepository.findDeliveredByRestaurantBetween(restaurant.id, start, end);
    const revenueCents = sumRevenueCents(orders);
    const lastDelivered = await this.orderRepository.findLastDeliveredAt(restaurant.id);
    const billing = restaurant.billing ?? defaultBilling(month);
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      tier: computeBillingTier(revenueCents),
      status: billing.status,
      cycle: billing.cycle,
      revenueCents,
      lastDeliveredAt: lastDelivered ? lastDelivered.toISOString() : null,
      blocked: isBillingBlocked(restaurant.billing),
    };
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/me', ...adminAuthenticated, async (req: Request, res: Response) => {
      res.json(200, { email: req.user!.email });
    });

    application.get('/platform/restaurants', ...adminAuthenticated, async (_req: Request, res: Response) => {
      const month = monthKeyOf(new Date());
      const restaurants = await this.restaurantRepository.listAll();
      const rows = await Promise.all(restaurants.map((restaurant) => this.buildRow(restaurant, month)));
      res.json(200, rows);
    });

    application.patch('/platform/restaurants/:id/billing', ...adminAuthenticated, async (req: Request, res: Response) => {
      const change = parseBody(billingChangeSchema, req.body);
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      const month = monthKeyOf(new Date());
      const current: IRestaurantBilling = restaurant.billing ?? defaultBilling(month);
      const next: IRestaurantBilling = {
        ...current,
        ...(change.status !== undefined ? { status: change.status } : {}),
        ...(change.cycle !== undefined ? { cycle: change.cycle } : {}),
      };
      const updated = await this.restaurantRepository.updateBilling(restaurant.id, next);
      res.json(200, await this.buildRow(updated, month));
    });
  }
}
