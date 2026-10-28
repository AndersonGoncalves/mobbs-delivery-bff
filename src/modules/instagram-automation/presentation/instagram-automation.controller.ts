import type { Request, Response, Server } from 'restify';
import { NotFoundError, ServiceUnavailableError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { environment } from '../../../shared/config/environment';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IInstagramPostRepository } from '../domain/repositories/instagram-post.repository.interface';
import { FacebookGraphClient } from '../infra/facebook-graph-client';
import { createInstagramPostSchema, instagramOAuthCallbackSchema } from './instagram-automation.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (follow-up) — automação de postagens no Instagram, menu
 * "Acessórios" restrito a dono/gerente (`GERENTE_ROLES` na web). Mesmo padrão de
 * `MercadoPagoOAuthController`: `config` devolve o necessário pra montar a URL de autorização sem
 * expor `appSecret`; `callback` troca o `code` por tokens e nunca devolve nenhum token na
 * resposta (só confirmação de vínculo).
 */
export class InstagramAutomationController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly postRepository: IInstagramPostRepository,
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

    application.get('/restaurants/me/instagram/config', ...operatorAuthenticated, async (_req: Request, res: Response) => {
      const { appId, appSecret, redirectUri } = environment.facebook;
      const missing = [
        ...(!appId ? ['FACEBOOK_APP_ID'] : []),
        ...(!appSecret ? ['FACEBOOK_APP_SECRET'] : []),
        ...(!redirectUri ? ['FACEBOOK_REDIRECT_URI'] : []),
      ];
      res.json(200, { configured: missing.length === 0, appId: appId ?? '', redirectUri: redirectUri ?? '', missing });
    });

    application.post('/restaurants/me/instagram/callback', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { code } = parseBody(instagramOAuthCallbackSchema, req.body);
      const { appId, appSecret, redirectUri, graphBaseUrl } = environment.facebook;
      if (!appId || !appSecret || !redirectUri) {
        throw new ServiceUnavailableError('Configure FACEBOOK_APP_ID, FACEBOOK_APP_SECRET e FACEBOOK_REDIRECT_URI no BFF.');
      }

      const client = new FacebookGraphClient(appId, appSecret, graphBaseUrl);
      const shortLived = await client.exchangeCodeForToken(code, redirectUri);
      const longLived = await client.getLongLivedToken(shortLived.accessToken);
      const account = await client.resolveInstagramBusinessAccount(longLived.accessToken);
      if (!account) {
        throw new ServiceUnavailableError('Nenhuma conta Instagram Business vinculada a uma Página do Facebook foi encontrada. Vincule o Instagram a uma Página no app do Instagram antes de tentar de novo.');
      }

      await this.restaurantRepository.saveInstagramTokens(req.restaurantId!, {
        instagramAccessToken: account.pageAccessToken,
        instagramAccountId: account.instagramAccountId,
        instagramPageId: account.pageId,
        instagramUsername: account.instagramUsername,
      });

      // Nunca devolve o token — só confirmação de que o vínculo foi feito.
      res.json(200, { instagramLinked: true, instagramUsername: account.instagramUsername });
    });

    application.del('/restaurants/me/instagram', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.clearInstagramConnection(req.restaurantId!);
      res.send(204);
    });

    application.get('/restaurants/me/instagram/scheduled-posts', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const posts = await this.postRepository.listByRestaurant(req.restaurantId!);
      res.json(200, posts);
    });

    application.post('/restaurants/me/instagram/scheduled-posts', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(createInstagramPostSchema, req.body);
      const post = await this.postRepository.create({ restaurantId: req.restaurantId!, ...input });
      res.json(201, post);
    });

    application.del('/restaurants/me/instagram/scheduled-posts/:id', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const deleted = await this.postRepository.delete(req.params.id, req.restaurantId!);
      if (!deleted) throw new NotFoundError('Postagem não encontrada, ou já publicada (não pode mais ser cancelada)');
      res.send(204);
    });
  }
}
