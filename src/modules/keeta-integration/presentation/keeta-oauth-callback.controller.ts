import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { webhookRateLimitMiddleware } from '../../../shared/http/rate-limits';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { KeetaAuthService } from '../infra/keeta-auth.service';

/**
 * specs/0212-integracao-keeta REQ-1/REQ-2 — rota pública (não é uma chamada autenticada nossa, é
 * o navegador do lojista sendo redirecionado pela Keeta depois de autorizar, modo "Standard
 * OAuth2" — `plan.md`, "Decisões (ADR)"). Resolve o restaurante pelo `state` gerado em
 * `buildAuthorizationUrl` (determinístico, sem o matching FIFO que o 99Food precisa usar),
 * troca o `code` por token, persiste e redireciona o navegador de volta pra retaguarda.
 */
export class KeetaOAuthCallbackController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly keetaAuthService: KeetaAuthService,
    private readonly webAppBaseUrl: string,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/webhooks/keeta/oauth-callback', webhookRateLimitMiddleware, async (req: Request, res: Response) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;

      if (!code || !state) {
        this.redirectToWeb(res, false);
        return;
      }

      const restaurant = await this.restaurantRepository.findByKeetaAuthorizationState(state);
      if (!restaurant) {
        console.warn('[keeta-integration] callback OAuth2 com state desconhecido/expirado.');
        this.redirectToWeb(res, false);
        return;
      }

      try {
        const tokens = await this.keetaAuthService.exchangeAuthorizationCode(code);
        const { brandId, shops } = await this.keetaAuthService.getAuthorizedShops(tokens.accessToken);
        if (shops.length === 0) {
          console.warn(`[keeta-integration] autorização do restaurante ${restaurant.id} não trouxe nenhuma loja vinculada.`);
          this.redirectToWeb(res, false);
          return;
        }
        if (shops.length > 1) {
          console.warn(`[keeta-integration] autorização do restaurante ${restaurant.id} trouxe ${shops.length} lojas; usando só a primeira (${shops[0].id}).`);
        }

        await this.restaurantRepository.saveKeetaBinding(restaurant.id, {
          shopId: shops[0].id,
          brandId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.tokenExpiresAt,
        });
        this.redirectToWeb(res, true);
      } catch (error) {
        console.error(`[keeta-integration] erro inesperado trocando o code do restaurante ${restaurant.id}:`, error);
        this.redirectToWeb(res, false);
      }
    });
  }

  private redirectToWeb(res: Response, success: boolean): void {
    res.header('Location', `${this.webAppBaseUrl}/painel/settings/keeta?connected=${success ? '1' : '0'}`);
    res.send(302);
  }
}
