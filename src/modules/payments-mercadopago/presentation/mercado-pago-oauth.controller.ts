import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { environment } from '../../../shared/config/environment';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { MercadoPagoClient } from '../infra/mercado-pago-client';
import { mercadoPagoOAuthCallbackSchema } from './mercado-pago-oauth.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0170-integracao-mercado-pago (REQ-1) — recebe o `code` devolvido pelo Mercado Pago no
 * redirect OAuth (a retaguarda já validou `state` contra o `sessionStorage` antes de chamar
 * aqui, ver plan.md), troca por `access_token`/`refresh_token` e persiste no restaurante.
 * Restrito a dono/gerente, mesma restrição de `/settings/*` e `AsaasOnboardingController`.
 * `access_token`/`refresh_token` nunca são devolvidos na resposta — mesmo cuidado de
 * `asaasApiKey`.
 */
export class MercadoPagoOAuthController extends BaseRouter {
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

    application.post('/restaurants/me/mercadopago/callback', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(mercadoPagoOAuthCallbackSchema, req.body);

      if (!environment.mercadoPago.clientId || !environment.mercadoPago.clientSecret || !environment.mercadoPago.redirectUri) {
        throw new Error('MERCADOPAGO_CLIENT_ID/MERCADOPAGO_CLIENT_SECRET/MERCADOPAGO_REDIRECT_URI não configuradas — vínculo com Mercado Pago indisponível.');
      }

      const client = new MercadoPagoClient(environment.mercadoPago.clientId, environment.mercadoPago.clientSecret, environment.mercadoPago.baseUrl);
      const tokens = await client.exchangeCodeForToken(input.code, environment.mercadoPago.redirectUri);

      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
      await this.restaurantRepository.saveMercadoPagoTokens(req.restaurantId!, {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoUserId: tokens.userId,
        mercadoPagoTokenExpiresAt: expiresAt,
      });

      // Nunca devolve os tokens — só confirmação de que o vínculo foi feito.
      res.json(200, { mercadoPagoLinked: true, mercadoPagoUserId: tokens.userId });
    });
  }
}
