import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRatingRepository } from '../domain/repositories/rating.repository.interface';
import { listRatingsQuerySchema, replyToRatingSchema, submitRatingSchema } from './ratings.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — avaliação do restaurante pelo cliente
 * (não do pedido/produto). `POST` exige sessão de cliente (`firebaseAuthMiddleware`, mesmo
 * raciocínio de `OrdersController.create` — não é rota de retaguarda, sem
 * `restaurantOperatorMiddleware`) e pelo menos um pedido `entregue` nesse restaurante; `GET` é
 * pública (qualquer cliente pode ver as avaliações de um restaurante antes de decidir pedir).
 *
 * specs/0078-resposta-restaurante-avaliacoes — `PATCH .../reply` é rota de retaguarda
 * (`restaurantOperatorMiddleware` + `dono`/`gerente`, mesmo escopo de `PromotionsController`).
 */
export class RatingsController extends BaseRouter {
  constructor(
    private readonly ratingRepository: IRatingRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/restaurants/:id/ratings', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const restaurantId = req.params.id;
      const restaurant = await this.restaurantRepository.findById(restaurantId);
      this.render(restaurant);

      const customerId = req.user!.uid;
      const hasDelivered = await this.orderRepository.hasDeliveredOrder(customerId, restaurantId);
      if (!hasDelivered) {
        throw new ConflictError('Só é possível avaliar um restaurante depois de um pedido entregue.');
      }

      const payload = parseBody(submitRatingSchema, req.body);
      const rating = await this.ratingRepository.upsert({
        restaurantId,
        customerId,
        score: payload.score,
        comment: payload.comment,
      });

      const stats = await this.ratingRepository.getStats(restaurantId);
      await this.restaurantRepository.updateRatingStats(restaurantId, stats.average, stats.count);

      res.json(200, rating);
    });

    application.get('/restaurants/:id/ratings', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      this.render(restaurant);

      const { page, pageSize } = parseBody(listRatingsQuerySchema, req.query);
      const result = await this.ratingRepository.findManyByRestaurant(req.params.id, page, pageSize);
      res.json(200, result);
    });

    // specs/0032 AC-8 (parte antes só verificada no POST, via 409) — o app usa isto pra decidir
    // se mostra o botão "Avaliar" de antemão, sem precisar tentar salvar pra descobrir.
    application.get('/restaurants/:id/ratings/eligibility', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      this.render(restaurant);

      const customerId = req.user!.uid;
      const canRate = await this.orderRepository.hasDeliveredOrder(customerId, req.params.id);
      res.json(200, { canRate });
    });

    // specs/0078-resposta-restaurante-avaliacoes REQ-2/REQ-3/AC-1/AC-2/AC-3.
    application.patch(
      '/restaurants/me/ratings/:id/reply',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
      async (req: Request, res: Response) => {
        const payload = parseBody(replyToRatingSchema, req.body);
        const rating = await this.ratingRepository.reply(req.params.id, req.restaurantId!, payload.text);
        if (!rating) throw new NotFoundError('Avaliação não encontrada');
        res.json(200, rating);
      },
    );
  }
}
