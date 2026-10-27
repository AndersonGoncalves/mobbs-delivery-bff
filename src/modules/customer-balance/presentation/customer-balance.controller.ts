import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { CustomerBalanceService } from '../domain/services/customer-balance.service';

/**
 * specs/0131-cashback-app REQ-3 / specs/0132-programa-fidelidade-app REQ-4 — leitura do cliente
 * logado (nunca de operador): saldo + progresso de fidelidade do restaurante, numa chamada só
 * (o app sempre precisa dos dois conjuntos de dado na mesma tela — `CustomerBalanceBanner`).
 */
export class CustomerBalanceController extends BaseRouter {
  constructor(
    private readonly customerBalanceService: CustomerBalanceService,
    private readonly restaurantRepository: IRestaurantRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/restaurants/:id/customer-balance', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const balance = await this.customerBalanceService.getOrCreate(req.user!.uid, restaurant.id);
      res.json(200, {
        balance: balance.balance,
        loyaltyStampCount: balance.loyaltyStampCount,
        cashbackPercent: restaurant.cashbackPercent,
        loyaltyGoalOrders: restaurant.loyaltyGoalOrders,
        loyaltyRewardValue: restaurant.loyaltyRewardValue,
      });
    });
  }
}
