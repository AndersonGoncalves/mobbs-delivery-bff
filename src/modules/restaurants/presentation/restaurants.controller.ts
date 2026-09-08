import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';

/**
 * REQ-1 (specs/0009-resolucao-restaurante): endpoint público (sem `firebaseAuthMiddleware`) —
 * usado antes do cliente logar/resolver o restaurante, nos dois canais (web e nativo).
 *
 * Handler `async` com só `(req, res)` — Restify exige essa assinatura pra handlers async (sem
 * `next`): a Promise retornada já faz o papel de `next()`/`next(error)` automaticamente (erro
 * lançado -> `next(error)`, resolve normal -> `next()`), confirmado rodando o BFF de verdade —
 * `(req, res, next)` async lança `AssertionError` na inicialização do servidor.
 */
export class RestaurantsController extends BaseRouter {
  constructor(private readonly restaurantRepository: IRestaurantRepository) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/restaurants/resolve/:slug', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findBySlug(req.params.slug);
      const resolved = this.render(restaurant && restaurant.isActive ? restaurant : null);
      res.json(200, resolved);
    });
  }
}
