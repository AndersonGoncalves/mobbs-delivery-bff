import type { Request, Response, Server } from 'restify';
import { ConflictError, ForbiddenError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { generateUniqueSlug } from '../domain/generate-unique-slug';
import { signupSchema } from './restaurants.schemas';

/**
 * specs/0038-autocadastro-restaurante — cria o restaurante e o primeiro operador (papel `dono`)
 * automaticamente, sem passo manual. Só `firebaseAuthMiddleware` (sem
 * `restaurantOperatorMiddleware`, que exigiria um operador já existente — esta rota cria o
 * primeiro). Controller dedicado, não dentro de `RestaurantsController`, pra não precisar
 * injetar `IRestaurantOperatorRepository` em toda rota já existente de `/restaurants/...`.
 */
export class RestaurantSignupController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorRepository: IRestaurantOperatorRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/restaurants/signup', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const { name, whatsapp } = parseBody(signupSchema, req.body);
      const email = req.user!.email;
      if (!email) {
        throw new ForbiddenError('Conta sem e-mail associado');
      }

      // REQ-4 (AC-4) — checa todo vínculo (ativo ou não), não só `findActiveOperatorByEmail`,
      // pra não permitir reabrir cadastro reativando um e-mail já usado num restaurante diferente.
      const existingOperator = await this.restaurantOperatorRepository.findByEmail(email);
      if (existingOperator) {
        throw new ConflictError('Este e-mail já está associado a um restaurante');
      }

      const slug = await generateUniqueSlug(name, this.restaurantRepository);
      const restaurant = await this.restaurantRepository.create({ name, slug, phone: whatsapp });
      await this.restaurantOperatorRepository.create(restaurant.id, email, 'dono');

      res.json(201, { restaurantId: restaurant.id, slug: restaurant.slug });
    });
  }
}
