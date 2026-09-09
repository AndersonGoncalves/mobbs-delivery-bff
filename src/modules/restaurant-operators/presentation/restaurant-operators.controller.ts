import type { Request, Response, Server } from 'restify';
import { BadRequestError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import { addOperatorSchema } from '../../restaurants/presentation/restaurants.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0010-configuracao-restaurante REQ-12/REQ-13 — gestão da allowlist de e-mails com acesso à
 * retaguarda do próprio restaurante (nunca de outro, `restaurantId` sempre do token via
 * `restaurantOperatorMiddleware`, nunca de parâmetro de rota).
 */
export class RestaurantOperatorsController extends BaseRouter {
  constructor(
    private readonly operatorRepository: IRestaurantOperatorRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.get('/restaurants/me/operators', ...authenticated, async (req: Request, res: Response) => {
      const operators = await this.operatorRepository.listByRestaurant(req.restaurantId!);
      res.json(200, operators);
    });

    application.post('/restaurants/me/operators', ...authenticated, async (req: Request, res: Response) => {
      const { email } = parseBody(addOperatorSchema, req.body);
      const operator = await this.operatorRepository.create(req.restaurantId!, email);
      res.json(201, operator);
    });

    application.del(
      '/restaurants/me/operators/:id',
      ...authenticated,
      async (req: Request, res: Response) => {
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        if (target.isActive) {
          const activeCount = await this.operatorRepository.countActiveByRestaurant(req.restaurantId!);
          // REQ-13: nunca deixar o restaurante sem nenhum operador ativo.
          if (activeCount <= 1) {
            throw new BadRequestError('Não é possível remover o único operador ativo do restaurante');
          }
        }
        await this.operatorRepository.deactivate(target.id);
        res.send(204);
      },
    );
  }
}
