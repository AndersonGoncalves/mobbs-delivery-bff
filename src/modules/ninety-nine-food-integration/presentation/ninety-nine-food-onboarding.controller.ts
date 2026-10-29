import type { Request, Response, Server } from 'restify';
import { BadRequestError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodAuthService } from '../infra/ninety-nine-food-auth.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0122-integracao-99food REQ-1 — diferente do iFood (credenciais digitadas pelo operador):
 * aqui o botão "Gerar link para autorizar" chama a API da 99Food (`app_id` de nível de app,
 * `environment.ninetyNineFood`) e devolve uma URL pra o dono abrir e autorizar no site deles.
 * Status conectado/desconectado é lido direto de `GET /restaurants/me`
 * (`ninetyNineFoodAppShopId`/`ninetyNineFoodConnectedAt` já voltam ali via `toOperatorRestaurant`
 * — `ninetyNineFoodAuthToken` nunca volta), sem precisar de uma rota de status dedicada.
 */
export class NinetyNineFoodOnboardingController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly ninetyNineFoodAuthService: NinetyNineFoodAuthService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    private readonly appConfigured: boolean,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.post('/restaurants/me/99food/authorize-link', ...operatorAuthenticated, async (req: Request, res: Response) => {
      if (!this.appConfigured) {
        // specs/0091-integracao-fiscal-focusnfe (mesmo padrão) — credencial de nível de app
        // (`NINETY_NINE_FOOD_APP_ID`/`NINETY_NINE_FOOD_APP_SECRET`) ainda não existe neste
        // ambiente; `docs/99FOOD.md` documenta o passo manual de cadastro de parceiro.
        throw new BadRequestError('Integração com o 99Food ainda não configurada nesta instância (sem credencial de app).');
      }

      const url = await this.ninetyNineFoodAuthService.getAuthorizationUrl();
      await this.restaurantRepository.markNinetyNineFoodAuthorizationPending(req.restaurantId!);
      res.json(200, { url });
    });

    application.del('/restaurants/me/99food/credentials', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.disconnectNinetyNineFood(req.restaurantId!);
      res.send(204);
    });
  }
}
