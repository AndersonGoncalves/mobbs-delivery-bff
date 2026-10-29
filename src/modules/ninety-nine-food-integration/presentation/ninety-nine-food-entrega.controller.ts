import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodEntregaDispatchService } from '../domain/services/ninety-nine-food-entrega-dispatch.service';
import { NinetyNineFoodClient } from '../infra/ninety-nine-food-client';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0130-integracao-99-entrega REQ-1/REQ-2/REQ-8/REQ-9 — ativar o serviço (uma vez por loja,
 * reaproveita o `auth_token` de `specs/0122`) e despachar/cancelar 99 Entrega por pedido,
 * restrito a dono/gerente (mesmo critério de `UberDeliveryOrderActionsController`). Validação de
 * precondição (REQ-8) fica aqui, não no serviço — mesmo raciocínio documentado em
 * `UberDeliveryOrderActionsController`/`FiscalOrderActionsController`.
 */
export class NinetyNineFoodEntregaController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly dispatchService: NinetyNineFoodEntregaDispatchService,
    private readonly client: NinetyNineFoodClient,
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

    application.post('/restaurants/me/99food/entrega/activate', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.ninetyNineFoodAuthToken) {
        throw new BadRequestError('Conecte a integração 99Food antes de ativar o 99 Entrega');
      }

      await this.client.activateEntregaService(restaurant.ninetyNineFoodAuthToken);
      const updated = await this.restaurantRepository.activateNinetyNineFoodEntrega(req.restaurantId!);
      res.json(200, { activated: Boolean(updated.ninetyNineFoodEntregaActivatedAt) });
    });

    application.post('/restaurants/me/orders/:id/99food-entrega/dispatch', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const order = await this.orderRepository.findById(req.params.id);
      if (!order || order.restaurantId !== req.restaurantId) throw new NotFoundError('Pedido não encontrado');

      // REQ-8 — só pedidos de origem 99Food (a API exige um "99Food order ID"), nunca pedido do
      // canal próprio.
      if (order.source !== '99food') throw new BadRequestError('99 Entrega só se aplica a pedidos recebidos do 99Food');
      if (order.orderType !== 'delivery') throw new BadRequestError('99 Entrega só se aplica a pedidos de entrega');
      if (order.status === 'cancelado' || order.status === 'entregue') {
        throw new BadRequestError('Pedido cancelado ou já entregue não pode ser despachado');
      }
      if (order.deliveryMotoboy) throw new ConflictError('Pedido já tem motoboy próprio atribuído');
      if (order.entregaDelivery) throw new ConflictError('Pedido já tem uma entrega 99 Entrega despachada');

      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.ninetyNineFoodEntregaActivatedAt) {
        throw new BadRequestError('Ative o 99 Entrega em Integrações > 99Food antes de despachar');
      }

      const updated = await this.dispatchService.dispatch(order, restaurant);
      res.json(200, updated);
    });

    application.post('/restaurants/me/orders/:id/99food-entrega/cancel', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const order = await this.orderRepository.findById(req.params.id);
      if (!order || order.restaurantId !== req.restaurantId) throw new NotFoundError('Pedido não encontrado');
      if (!order.entregaDelivery?.entregaOrderId) throw new BadRequestError('Pedido não tem entrega 99 Entrega ativa');

      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.ninetyNineFoodAuthToken) throw new BadRequestError('Restaurante sem integração 99Food conectada');

      await this.client.cancelEntregaOrder(restaurant.ninetyNineFoodAuthToken, { entregaOrderId: order.entregaDelivery.entregaOrderId });
      const updated = await this.orderRepository.updateEntregaDelivery(order.id, { ...order.entregaDelivery, status: 'cancelado' });
      res.json(200, updated);
    });
  }
}
