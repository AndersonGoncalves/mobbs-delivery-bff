import type { Request, Response, Server } from 'restify';
import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import type { IHelpArticleRepository } from '../domain/help-article';
import { listHelpArticlesSchema } from './help-article.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0105-modulo-ajuda-retaguarda REQ-8/REQ-9 — manual de ajuda da retaguarda. Só exige
 * operador autenticado (`firebaseAuthMiddleware` + `restaurantOperatorMiddleware`), sem checagem
 * de papel: o manual fica aberto a todos os papéis, igual às outras páginas do grupo "Ajuda"
 * (REQ-9) — ver qualquer operador de qualquer restaurante, não é um recurso restrito por loja.
 */
export class HelpArticleController extends BaseRouter {
  constructor(
    private readonly repository: IHelpArticleRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.get('/help/articles', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { audience } = parseBody(listHelpArticlesSchema, req.query);
      res.json(200, await this.repository.list(audience));
    });
  }
}
