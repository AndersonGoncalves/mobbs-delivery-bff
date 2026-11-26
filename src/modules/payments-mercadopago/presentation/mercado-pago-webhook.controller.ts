import { createHmac } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { environment } from '../../../shared/config/environment';
import { webhookRateLimitMiddleware } from '../../../shared/http/rate-limits';
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
 * URL por restaurante).
 *
 * specs/0226 REQ-B3 — também recebe o tópico `order` (Pix criado pela API de Orders,
 * `OrdersController.tryChargeOrderPixViaMercadoPago`) e o tópico `payment` de um Pix; os dois
 * confirmam pelo mesmo `ConfirmOnlinePaymentService`, com trava atômica contra confirmação dupla.
 *
 * specs/0226 REQ-A3/REQ-A4 — o restaurante é achado pelo `user_id` do aviso (a conta Mercado Pago
 * dona do pagamento, gravada no vínculo OAuth como `mercadoPagoUserId`), e o pagamento é
 * consultado com o token DELE (antes: token da aplicação, que pode não enxergar pagamento de outra
 * conta). O pedido (`external_reference`) precisa ser desse mesmo restaurante. Ao aprovar, grava o
 * id do PAGAMENTO no `externalReference` (antes ficava o id da preferência, e o estorno falhava).
 *
 * Validação por assinatura (`x-signature: ts=<ts>,v1=<hash>`), segredo da APLICAÇÃO (não por
 * restaurante — ver `environment.mercadoPago.webhookSecret`). Contrato de assinatura
 * corroborado por implementações de terceiros, não 100% documentado nos docs oficiais — ver
 * plan.md, precisa validação contra sandbox real antes de produção.
 *
 * Responde 200 pra qualquer evento reconhecido mas que não dispara nada (mesmo raciocínio do
 * `AsaasWebhookController`: erro pra evento que só não interessa faria o MP reentregar/alertar
 * sem motivo).
 *
 * specs/0226 REQ-A18 — o mesmo vale para os avisos que decidimos IGNORAR depois de validar a
 * assinatura (pedido inexistente, de outro restaurante, sem pagamento do Mercado Pago com aquele
 * meio, pagamento que não está mais pendente, aviso sem `user_id`): 200 + log com o motivo. Antes
 * eram 400/404/409, o Mercado Pago reenviava e o indicador "Notificações entregues com sucesso"
 * caía (25% em 26/11/2026). Só a assinatura inválida continua com erro (401).
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

  /** specs/0226 REQ-A18 — aviso válido que não vamos processar: registra o motivo e responde 200. */
  private ignore(res: Response, type: string | undefined, resourceId: string, reason: string): void {
    console.warn(`[mercadopago] aviso ${type} ${resourceId} ignorado: ${reason}`);
    res.send(200);
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

    // Documentação do Mercado Pago: id alfanumérico (ex. `ORD…` do tópico `order`) entra em
    // minúsculas no manifesto; id numérico (tópico `payment`) não muda.
    const manifest = `id:${paymentId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', environment.mercadoPago.webhookSecret).update(manifest).digest('hex');
    return expected === v1;
  }

  initializeRoutes(application: Server): void {
    // Achado de auditoria (06/11/2026) — sem Firebase por trás, rate limit por IP antes de
    // calcular a assinatura HMAC (evita gastar CPU com isso a cada tentativa num flood).
    application.post('/webhooks/mercadopago', webhookRateLimitMiddleware, async (req: Request, res: Response) => {
      const body = req.body as { type?: string; data?: { id?: string | number }; user_id?: string | number };
      const resourceId = body.data?.id === undefined || body.data?.id === null ? '' : String(body.data.id);

      // specs/0226 REQ-B3 — `payment` (cartão pela API de Preferences e, às vezes, o pagamento
      // por trás do Pix) e `order` (Pix pela API de Orders). Os demais tópicos não interessam.
      if ((body.type !== 'payment' && body.type !== 'order') || !resourceId) {
        res.send(200);
        return;
      }

      if (!this.isValidSignature(req.header('x-signature'), req.header('x-request-id'), resourceId)) {
        throw new UnauthorizedError('Assinatura de webhook inválida');
      }

      // specs/0226 REQ-A4 — conta Mercado Pago dona do pagamento → restaurante vinculado a ela.
      const mercadoPagoUserId = body.user_id === undefined || body.user_id === null ? '' : String(body.user_id);
      if (!mercadoPagoUserId) {
        this.ignore(res, body.type, resourceId, 'aviso sem user_id');
        return;
      }
      const restaurant = await this.restaurantRepository.findByMercadoPagoUserId(mercadoPagoUserId);
      if (!restaurant?.mercadoPagoAccessToken) {
        // Conta que não está vinculada a nenhum restaurante (ex.: a própria conta da aplicação,
        // ou o "Simular notificação" do painel): nada a fazer aqui — 200 pra não gerar reenvio.
        console.warn(`[mercadopago] aviso ${body.type} ${resourceId} de uma conta (${mercadoPagoUserId}) sem restaurante vinculado — ignorado`);
        res.send(200);
        return;
      }

      const client = new MercadoPagoClient(environment.mercadoPago.clientId ?? '', environment.mercadoPago.clientSecret ?? '', environment.mercadoPago.baseUrl);

      // Normaliza os dois tópicos: de qual pedido é, se já está pago, e se é Pix.
      let externalReference: string;
      let paid: boolean;
      let isPix: boolean;
      let mercadoPagoPaymentId: string | undefined;
      if (body.type === 'order') {
        const mpOrder = await client.getOrder(restaurant.mercadoPagoAccessToken, resourceId);
        externalReference = mpOrder.externalReference;
        paid = mpOrder.status === 'processed';
        isPix = true; // só o Pix usa a API de Orders (o cartão segue na de Preferences, specs/0225)
      } else {
        const mpPayment = await client.getPayment(restaurant.mercadoPagoAccessToken, resourceId);
        externalReference = mpPayment.externalReference;
        paid = mpPayment.status === 'approved';
        isPix = mpPayment.paymentMethodId === 'pix';
        mercadoPagoPaymentId = mpPayment.id;
      }

      if (!externalReference) {
        res.send(200);
        return;
      }

      const order = await this.orderRepository.findById(externalReference);
      if (!order) {
        this.ignore(res, body.type, resourceId, `pedido ${externalReference} não encontrado`);
        return;
      }
      if (order.restaurantId !== restaurant.id) {
        this.ignore(res, body.type, resourceId, `pedido #${order.orderNumber} não pertence ao restaurante da conta ${mercadoPagoUserId}`);
        return;
      }

      const payment = await this.paymentRepository.findByOrderId(order.id);
      const isMercadoPagoPix = !!payment && payment.method === 'pix' && payment.provider === 'mercadopago';
      const isMercadoPagoCard = !!payment && payment.method === 'creditCardOnline' && payment.provider !== 'asaas';
      if (!payment || (isPix ? !isMercadoPagoPix : !isMercadoPagoCard)) {
        this.ignore(res, body.type, resourceId, `pedido #${order.orderNumber} não tem pagamento ${isPix ? 'Pix' : 'de cartão'} pelo Mercado Pago`);
        return;
      }

      if (!paid) {
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
        this.ignore(res, body.type, resourceId, `pagamento do pedido #${order.orderNumber} está ${payment.status}, não pendente`);
        return;
      }

      // specs/0226 REQ-B3 — trava atômica: o Pix chega pelos dois tópicos, às vezes juntos; só o
      // primeiro confirma (WhatsApp e avanço do pedido uma vez só).
      const claimed = await this.paymentRepository.markAsApprovedIfPending(order.id);
      if (!claimed) {
        const current = await this.paymentRepository.findByOrderId(order.id);
        res.json(200, { ...order, payment: current ? this.toPaymentSummary(current) : undefined });
        return;
      }

      // specs/0226 REQ-A3 — cartão: a partir daqui `externalReference` é o id do PAGAMENTO (o
      // estorno usa). O Pix mantém o id da ORDER, que é o que o estorno do Pix usa (REQ-B4).
      if (!isPix && mercadoPagoPaymentId) {
        await this.paymentRepository.updateExternalReference(order.id, mercadoPagoPaymentId);
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
