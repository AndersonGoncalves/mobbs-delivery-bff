import type { Request, Response, Server } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { UberDeliveryStatus } from '../../orders/domain/entities/order.entity';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { UberDeliveryRawStatus } from '../infra/uber-direct-client';

interface OrdersControllerLike {
  markDeliveredViaExternalCourier(orderId: string, restaurantId: string): Promise<void>;
}

const STATUS_MAP: Record<UberDeliveryRawStatus, UberDeliveryStatus> = {
  pending: 'solicitado',
  pickup: 'aceito',
  pickup_complete: 'aceito',
  dropoff: 'a_caminho',
  delivered: 'entregue',
  canceled: 'cancelado',
  returned: 'cancelado',
};

/**
 * specs/0121-integracao-uber-entregas REQ-3/REQ-6 — retorno assíncrono da Uber Direct (evento
 * `event.delivery_status`, confirmado na doc pública — `plan.md`). Diferente de
 * `FiscalWebhookController`/`AsaasWebhookController` (header com um token nosso): o dashboard da
 * Uber só aceita configurar uma URL, não um header customizado, então o token vai como QUERY
 * PARAM da própria URL que o operador cola no dashboard (`?token=...`) — ver `plan.md`,
 * "Limitações conhecidas" #1 (verificação HMAC nativa da Uber, `x-uber-signature`, não
 * implementada: exigiria capturar o corpo cru antes do `restify.plugins.bodyParser()` global).
 *
 * Responde 200 mesmo quando não há nada a fazer (pedido não encontrado, delivery_id desconhecido)
 * — mesmo raciocínio do Asaas/FocusNFe: devolver erro pra um evento que só não precisa de ação
 * faria a Uber reentregar/alertar sem motivo.
 */
export class UberDeliveryWebhookController extends BaseRouter {
  constructor(
    private readonly uberDeliveryConfigRepository: IUberDeliveryConfigRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly ordersController: OrdersControllerLike,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/uber-direct/:restaurantId', async (req: Request, res: Response) => {
      const config = await this.uberDeliveryConfigRepository.findByRestaurantId(req.params.restaurantId);
      const token = (req.query as Record<string, string> | undefined)?.token;
      if (!config || token !== config.webhookToken) {
        throw new UnauthorizedError('Token de webhook inválido');
      }

      const payload = req.body as { delivery_id?: string; status?: UberDeliveryRawStatus; data?: { tracking_url?: string } };
      const deliveryId = payload.delivery_id;
      const rawStatus = payload.status;
      if (!deliveryId || !rawStatus) {
        res.send(200);
        return;
      }

      const order = await this.orderRepository.findByUberDeliveryId(req.params.restaurantId, deliveryId);
      if (!order) {
        res.send(200);
        return;
      }

      const status = STATUS_MAP[rawStatus] ?? 'solicitado';
      await this.orderRepository.updateUberDelivery(order.id, {
        ...order.uberDelivery,
        status,
        deliveryId,
        trackingUrl: payload.data?.tracking_url ?? order.uberDelivery?.trackingUrl,
      });

      // REQ-6 — só tenta a transição de status quando a Uber confirma "delivered"; no-op
      // silencioso se o pedido não estiver em `saiuParaEntrega` (ver docstring do método).
      if (status === 'entregue') {
        await this.ordersController.markDeliveredViaExternalCourier(order.id, req.params.restaurantId);
      }

      res.send(200);
    });
  }
}
