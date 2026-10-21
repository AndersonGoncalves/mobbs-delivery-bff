import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError, UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPayment } from '../../orders/domain/entities/order.entity';
import { ConfirmOnlinePaymentService } from '../../orders/domain/services/confirm-online-payment.service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';

const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

/**
 * specs/0101-integracao-asaas (fase 1) — recebe os webhooks de pagamento do Asaas (formato
 * nativo: `{ id, event, dateCreated, payment: {...} }`, conferido na documentação oficial, NÃO
 * o contrato gateway-agnóstico genérico de `specs/0140` — esse continua existindo separado, pra
 * qualquer gateway simples que já consiga falar `{ orderId, status }` direto). Autenticado pelo
 * header `asaas-access-token` (configurado na criação da subconta, `AsaasOnboardingController`),
 * sem token Firebase nem operador logado — quem chama é o Asaas.
 *
 * Responde 200 pra qualquer evento reconhecido (mesmo os que não acionam nada) — devolver erro
 * pra um evento que só não nos interessa faria o Asaas reentregar/alertar sem motivo.
 */
export class AsaasWebhookController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
  ) {
    super();
  }

  private toPaymentSummary(payment: IPayment): Pick<IPayment, 'method' | 'status'> {
    return { method: payment.method, status: payment.status };
  }

  initializeRoutes(application: Server): void {
    // Sem middleware de autenticação separado (diferente de `payment-webhook-api-key.middleware.ts`,
    // que resolve o restaurante A PARTIR da chave): aqui o restaurante já vem no path (é como o
    // Asaas identifica qual subconta o webhook pertence, definido na URL registrada em
    // `AsaasOnboardingController`) — a validação é só "o header bate com o token DESSE
    // restaurante", então fica inline no handler.
    application.post('/webhooks/asaas/:restaurantId', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.restaurantId);
      const token = req.header('asaas-access-token');
      if (!restaurant || !restaurant.asaasWebhookToken || token !== restaurant.asaasWebhookToken) {
        throw new UnauthorizedError('Token de webhook inválido');
      }

      const body = req.body as { event?: string; payment?: { externalReference?: string } };
      const event = body.event;
      const orderId = body.payment?.externalReference;

      if (!event || !PAID_EVENTS.has(event) || !orderId) {
        res.send(200);
        return;
      }

      const order = await this.orderRepository.findById(orderId);
      if (!order || order.restaurantId !== restaurant.id) {
        throw new NotFoundError('Pedido não encontrado');
      }

      const payment = await this.paymentRepository.findByOrderId(order.id);
      if (!payment || payment.method !== 'pix') {
        throw new ConflictError('Pedido não tem pagamento Pix');
      }

      // Idempotência (delivery `at-least-once`, confirmado na documentação do Asaas): um reenvio
      // do mesmo evento pro mesmo pedido já aprovado é sucesso, não erro.
      if (payment.status === 'aprovado') {
        res.json(200, { ...order, payment: this.toPaymentSummary(payment) });
        return;
      }
      if (payment.status !== 'pendente') {
        throw new ConflictError('Pagamento não pode ser confirmado');
      }

      const { order: updatedOrder, payment: updatedPayment } = await new ConfirmOnlinePaymentService(
        this.paymentRepository,
        this.orderRepository,
        this.restaurantRepository,
        this.whatsAppNotificationService,
      ).confirm(order);

      res.json(200, { ...updatedOrder, payment: this.toPaymentSummary(updatedPayment) });
    });
  }
}
