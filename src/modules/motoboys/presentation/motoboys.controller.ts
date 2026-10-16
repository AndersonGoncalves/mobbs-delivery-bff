import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IMotoboyRepository } from '../domain/repositories/motoboy.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0119-cadastro-motoboys — motoboys do restaurante do operador logado, mesmo padrão de
 * isolamento `restaurants.me.*` já usado em `suppliers`/`raw-materials`.
 *
 * (ajuste, pedido explícito do usuário) — "Cadastro de motoboys" (web) virou só leitura, listando
 * `RestaurantOperator` com papel `motoboy` (ver `restaurant-operators.controller.ts`,
 * `GET /restaurants/me/operators/motoboys`); POST/PUT/PATCH deste cadastro legado (`Motoboy`)
 * saíram daqui porque nada mais os chama — ninguém mais cria, edita ou (des)ativa um `Motoboy`. O
 * GET continua existindo (dado antigo não foi apagado do banco), só não tem mais consumidor na
 * web.
 */
export class MotoboysController extends BaseRouter {
  constructor(
    private readonly motoboyRepository: IMotoboyRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador — mesmo papel de fornecedores/estoque: `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    application.get('/restaurants/me/motoboys', ...authenticated, async (req: Request, res: Response) => {
      const motoboys = await this.motoboyRepository.listByRestaurant(req.restaurantId!);
      res.json(200, motoboys);
    });
  }
}
