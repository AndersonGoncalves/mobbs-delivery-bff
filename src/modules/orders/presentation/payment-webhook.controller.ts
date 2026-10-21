import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPayment } from '../domain/entities/order.entity';
import { ConfirmOnlinePaymentService } from '../domain/services/confirm-online-payment.service';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { pixConfirmedWebhookSchema } from './orders.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0140-confirmacao-automatica-pix REQ-1b — rota gateway-agnóstica que um futuro provedor
 * de PSP (`specs/0101-integracao-asaas`, `specs/0170-integracao-mercado-pago`) vai chamar quando
 * confirmar um Pix, acionando exatamente a mesma lógica da confirmação manual
 * (`OrdersController.payment/confirm`, REQ-1a) via `ConfirmOnlinePaymentService`. Autenticada por
 * chave de API por restaurante (`X-Payment-Webhook-Api-Key`, `paymentWebhookApiKeyMiddleware`),
 * não por token Firebase/operador logado — quem chama é um provedor externo, sem sessão humana.
 * REQ-5: enquanto nenhum restaurante tiver uma chave gerada/configurada num gateway real, esta
 * rota existe mas nada a chama — o fluxo manual (REQ-1a) continua funcionando sozinho.
 */
export class PaymentWebhookController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
    private readonly paymentWebhookApiKeyMiddleware: AsyncHandler,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  private toPaymentSummary(payment: IPayment): Pick<IPayment, 'method' | 'status'> {
    return { method: payment.method, status: payment.status };
  }

  initializeRoutes(application: Server): void {
    const webhookAuthenticated: AsyncHandler[] = [this.paymentWebhookApiKeyMiddleware];
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.post('/restaurants/me/payment-webhook/pix-confirmed', ...webhookAuthenticated, async (req: Request, res: Response) => {
      const { orderId, status } = parseBody(pixConfirmedWebhookSchema, req.body);

      // Qualquer status diferente de 'aprovado' (recusado, expirado, pendente de novo, etc.) é
      // um no-op — tratar essas variações é escopo da spec do gateway específico, não desta.
      if (status !== 'aprovado') {
        res.send(204);
        return;
      }

      const order = await this.orderRepository.findById(orderId);
      if (!order || order.restaurantId !== req.restaurantId) {
        throw new NotFoundError('Pedido não encontrado');
      }

      const payment = await this.paymentRepository.findByOrderId(order.id);
      if (!payment || payment.method !== 'pix') {
        throw new ConflictError('Pedido não tem pagamento Pix');
      }

      // Idempotência de webhook (REQ-5): provedores reais são `at-least-once` — um reenvio do
      // mesmo aviso pro mesmo pedido já aprovado é sucesso, não erro (evita o provedor tratar
      // isso como falha e ficar reentregando em loop).
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

    // Mesmo padrão de `AutoPrintController.regenerate-key` (specs/0139 REQ-6/REQ-7) — regenerar
    // invalida a chave anterior (a antiga simplesmente não casa mais com nenhum restaurante).
    application.post('/restaurants/me/payment-webhook/regenerate-key', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.regeneratePaymentWebhookApiKey(req.restaurantId!);
      res.json(200, { paymentWebhookApiKey: restaurant.paymentWebhookApiKey });
    });
  }
}
