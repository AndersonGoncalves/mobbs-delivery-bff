import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { saveIFoodCredentialsSchema } from './ifood-onboarding.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0090-integracao-ifood REQ-9 — cadastro das credenciais da integração com o iFood,
 * restrito a dono/gerente (mesmo padrão de `AsaasOnboardingController`). Status
 * conectado/desconectado é lido direto de `GET /restaurants/me` (`ifoodMerchantId`/
 * `ifoodConnectedAt` já voltam ali via `toOperatorRestaurant` — `ifoodClientSecret` nunca volta),
 * sem precisar de uma rota de status dedicada.
 */
export class IFoodOnboardingController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.post('/restaurants/me/ifood/credentials', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveIFoodCredentialsSchema, req.body);
      await this.restaurantRepository.saveIFoodCredentials(req.restaurantId!, input);
      res.json(200, { ifoodMerchantId: input.ifoodMerchantId, connected: true });
    });

    application.del('/restaurants/me/ifood/credentials', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.disconnectIFood(req.restaurantId!);
      res.send(204);
    });
  }
}
