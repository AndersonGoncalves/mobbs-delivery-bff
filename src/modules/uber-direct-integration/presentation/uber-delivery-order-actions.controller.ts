import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { UberDeliveryDispatchService } from '../domain/services/uber-delivery-dispatch.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0121-integracao-uber-entregas REQ-2/REQ-4/REQ-5 — despacho manual de uma entrega via Uber
 * Direct, restrito a dono/gerente (mesmo critério de acesso de `/orders/:id/delivery-motoboy`).
 * Validação de precondição fica aqui (mesmo raciocínio documentado em
 * `FiscalOrderActionsController`): o serviço só executa, quem decide "pode" é este controller.
 * Erro de cotação recusada (REQ-5) NÃO é capturado aqui — propaga como está (status 500, corpo
 * `{ message }`), mesmo padrão já usado por `FiscalOrderActionsController.cancelDocument` pra
 * erro de negócio de um provedor externo; o pedido continua intacto e disponível pra motoboy
 * próprio (nada foi alterado antes do erro).
 */
export class UberDeliveryOrderActionsController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly uberDeliveryConfigRepository: IUberDeliveryConfigRepository,
    private readonly uberDeliveryDispatchService: UberDeliveryDispatchService,
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

    application.post('/restaurants/me/orders/:id/uber-delivery/dispatch', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const order = await this.orderRepository.findById(req.params.id);
      if (!order || order.restaurantId !== req.restaurantId) throw new NotFoundError('Pedido não encontrado');

      // REQ-4 — só se aplica a delivery (spec.md, "Fora de escopo": nunca pickup); REQ-6 — nunca
      // despacha pedido já cancelado/entregue.
      if (order.orderType !== 'delivery') throw new BadRequestError('Uber Entregas só se aplica a pedidos de entrega');
      if (order.status === 'cancelado' || order.status === 'entregue') {
        throw new BadRequestError('Pedido cancelado ou já entregue não pode ser despachado');
      }
      if (order.deliveryMotoboy) throw new ConflictError('Pedido já tem motoboy próprio atribuído');
      if (order.uberDelivery) throw new ConflictError('Pedido já tem uma entrega Uber despachada');

      const config = await this.uberDeliveryConfigRepository.findByRestaurantId(req.restaurantId!);
      if (!config) throw new BadRequestError('Configuração Uber Entregas não encontrada — configure em Integrações > Uber Entregas antes de despachar');

      const updated = await this.uberDeliveryDispatchService.dispatch(order, config);
      res.json(200, updated);
    });
  }
}
