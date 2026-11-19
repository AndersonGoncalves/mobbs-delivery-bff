import type { Request, Response, Server } from 'restify';
import { BadRequestError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { KeetaAuthService } from '../infra/keeta-auth.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0212-integracao-keeta REQ-1 — mesmo padrão de `NinetyNineFoodOnboardingController`: o
 * botão "Gerar link para autorizar" monta a URL localmente (`KeetaAuthService.buildAuthorizationUrl`,
 * sem chamada de API — diferente do 99Food) e devolve pra o dono abrir e autorizar no site da
 * Keeta. Status conectado/desconectado é lido direto de `GET /restaurants/me`
 * (`keetaShopId`/`keetaConnectedAt` já voltam ali via `toOperatorRestaurant` — `keetaAccessToken`/
 * `keetaRefreshToken` nunca voltam), sem precisar de uma rota de status dedicada.
 */
export class KeetaOnboardingController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly keetaAuthService: KeetaAuthService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    private readonly appConfigured: boolean,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono'),
    ];

    application.post('/restaurants/me/keeta/authorize-link', ...operatorAuthenticated, async (req: Request, res: Response) => {
      if (!this.appConfigured) {
        // specs/0091-integracao-fiscal-focusnfe (mesmo padrão) — credencial de nível de app
        // (`KEETA_APP_ID`/`KEETA_APP_SECRET`/`KEETA_REDIRECT_URI`) ainda não existe neste
        // ambiente; `docs/KEETA.md` documenta o processo de cadastro de desenvolvedor.
        throw new BadRequestError('Integração com a Keeta ainda não configurada nesta instância (sem credencial de app).');
      }

      const { url, state } = this.keetaAuthService.buildAuthorizationUrl();
      await this.restaurantRepository.markKeetaAuthorizationPending(req.restaurantId!, state);
      res.json(200, { url });
    });

    application.del('/restaurants/me/keeta/credentials', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.disconnectKeeta(req.restaurantId!);
      res.send(204);
    });
  }
}
