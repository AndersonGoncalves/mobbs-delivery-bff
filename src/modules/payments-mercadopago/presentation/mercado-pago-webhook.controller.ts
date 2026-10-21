import { createHmac } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError, UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { environment } from '../../../shared/config/environment';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPayment } from '../../orders/domain/entities/order.entity';
import { ConfirmOnlinePaymentService } from '../../orders/domain/services/confirm-online-payment.service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import { MercadoPagoClient } from '../infra/mercado-pago-client';

/**
 * specs/0170-integracao-mercado-pago (REQ-6) — recebe os webhooks de pagamento do Mercado Pago,
 * `POST /webhooks/mercadopago`, endpoint ÚNICO e GLOBAL (diferente do Asaas, que registra uma
 * URL por restaurante): o Mercado Pago não manda o restaurante na URL, por isso o pedido (e,
 * através dele, o restaurante) só é conhecido depois de consultar `GET /v1/payments/{id}` com
 * o `external_reference` que a gente mesmo gravou na criação da preferência.
 *
 * Validação por assinatura (`x-signature: ts=<ts>,v1=<hash>`), segredo da APLICAÇÃO (não por
 * restaurante — ver `environment.mercadoPago.webhookSecret`). Contrato de assinatura
 * corroborado por implementações de terceiros, não 100% documentado nos docs oficiais — ver
 * plan.md, precisa validação contra sandbox real antes de produção.
 *
 * Responde 200 pra qualquer evento reconhecido mas que não dispara nada (mesmo raciocínio do
 * `AsaasWebhookController`: erro pra evento que só não interessa faria o MP reentregar/alertar
 * sem motivo).
 */
export class MercadoPagoWebhookController extends BaseRouter {
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

  private isValidSignature(xSignature: string | undefined, xRequestId: string | undefined, paymentId: string): boolean {
    if (!environment.mercadoPago.webhookSecret || !xSignature || !xRequestId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      }),
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', environment.mercadoPago.webhookSecret).update(manifest).digest('hex');
    return expected === v1;
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/mercadopago', async (req: Request, res: Response) => {
      const body = req.body as { type?: string; data?: { id?: string } };
      const paymentId = body.data?.id;

      if (!body.type || body.type !== 'payment' || !paymentId) {
        res.send(200);
        return;
      }

      if (!this.isValidSignature(req.header('x-signature'), req.header('x-request-id'), paymentId)) {
        throw new UnauthorizedError('Assinatura de webhook inválida');
      }

      if (!environment.mercadoPago.platformAccessToken) {
        throw new Error('MERCADOPAGO_PLATFORM_ACCESS_TOKEN não configurado — não é possível consultar o pagamento recebido.');
      }

      const client = new MercadoPagoClient(environment.mercadoPago.clientId ?? '', environment.mercadoPago.clientSecret ?? '', environment.mercadoPago.baseUrl);
      const mpPayment = await client.getPayment(environment.mercadoPago.platformAccessToken, paymentId);

      if (!mpPayment.externalReference) {
        res.send(200);
        return;
      }

      const order = await this.orderRepository.findById(mpPayment.externalReference);
      if (!order) {
        throw new NotFoundError('Pedido não encontrado');
      }

      const payment = await this.paymentRepository.findByOrderId(order.id);
      if (!payment || payment.method !== 'creditCardOnline') {
        throw new ConflictError('Pedido não tem pagamento de cartão online via Mercado Pago');
      }

      if (mpPayment.status !== 'approved') {
        res.send(200);
        return;
      }

      // Idempotência (delivery `at-least-once`, mesmo raciocínio do Asaas): um reenvio do mesmo
      // pagamento já aprovado é sucesso, não erro.
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
