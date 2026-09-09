import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';

/**
 * REQ-1/REQ-3 (`specs/0003-catalogo-navegacao`) — leitura do cardápio do restaurante já resolvido
 * pelo cliente (`specs/0009`). Autenticado (`firebaseAuthMiddleware`, plan.md — "autenticadas via
 * 0002"), mas **sem** `restaurantOperatorMiddleware`: qualquer `Customer` logado pode ver o
 * cardápio de qualquer restaurante (não é uma rota de retaguarda) — `restaurantId` vem do próprio
 * path (`:id`), o restaurante já resolvido no app/web, nunca da identidade do operador.
 *
 * Handlers `async (req, res)`, sem `next` — mesma regra de arity do Restify já documentada em
 * `RestaurantsController` (specs/0009 T008).
 */
export class CatalogController extends BaseRouter {
  constructor(
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get(
      '/restaurants/:id/menu-categories',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const categories = await this.menuCategoryRepository.listByRestaurant(req.params.id);
        res.json(200, categories);
      },
    );

    application.get('/products/:id', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const product = await this.productRepository.findById(req.params.id);
      res.json(200, this.render(product));
    });
  }
}
