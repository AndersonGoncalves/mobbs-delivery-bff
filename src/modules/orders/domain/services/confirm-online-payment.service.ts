import { IOrder, IPayment } from '../entities/order.entity';
import { IOrderRepository } from '../repositories/order.repository.interface';
import { IPaymentRepository } from '../repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../../notifications/domain/services/i-whatsapp-notification.service';

/**
 * specs/0140-confirmacao-automatica-pix REQ-1 (renomeado de `ConfirmPixPaymentService` em
 * specs/0170-integracao-mercado-pago — passou a servir qualquer método de pagamento online, não
 * só Pix) — ponto único que marca o pagamento como aprovado e, se o pedido ainda estiver
 * `aguardandoConfirmacao` e o restaurante tiver `order.paymentMethod` em
 * `autoConfirmPaymentMethods` (specs/0151), avança o pedido pra `confirmado` na mesma operação.
 * Usado pela confirmação manual de Pix (`OrdersController`, `PATCH .../payment/confirm`), pelo
 * webhook gateway-agnóstico (`PaymentWebhookController`) e pelos webhooks de gateway reais
 * (`AsaasWebhookController`, `MercadoPagoWebhookController`) — garante o mesmo comportamento
 * independente do método/origem, sem duplicar a regra em cada um.
 *
 * `order` já deve chegar validado pelo chamador (`Payment.method === order.paymentMethod`,
 * `Payment.status === 'pendente'`) — o que varia por origem é a resposta de erro quando isso não
 * vale (manual: 409 imediato; webhook: idempotente em cima de reentrega), não a confirmação em
 * si, por isso essa validação fica fora deste serviço.
 */
export class ConfirmOnlinePaymentService {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
  ) {}

  async confirm(order: IOrder): Promise<{ order: IOrder; payment: IPayment }> {
    const updatedPayment = await this.paymentRepository.markAsApproved(order.id);

    // specs/0064-notificacao-whatsapp-pix-confirmado REQ-3 — mensagem específica de "Pix
    // confirmado" (template/liga-desliga próprios, `notifyCustomerOnPixConfirmed`). Só faz
    // sentido pro método Pix — outros métodos online (cartão via Asaas/Mercado Pago) não têm
    // template próprio ainda (fora de escopo de specs/0170); `sendOrderStatusUpdate` abaixo já
    // avisa o cliente de forma genérica quando o pedido avança pra `confirmado`.
    if (order.paymentMethod === 'pix') {
      void this.whatsAppNotificationService.sendPaymentConfirmedMessage(order).catch((error) => {
        console.error(`[whatsapp] erro inesperado enviando confirmação de pagamento do pedido ${order.id}:`, error);
      });
    }

    let updatedOrder = order;
    if (order.status === 'aguardandoConfirmacao') {
      const restaurant = await this.restaurantRepository.findById(order.restaurantId);
      if (restaurant?.autoConfirmPaymentMethods?.includes(order.paymentMethod)) {
        updatedOrder = await this.orderRepository.updateStatus(order.id, 'confirmado', order.restaurantId);
        void this.whatsAppNotificationService.sendOrderStatusUpdate(updatedOrder).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando confirmação automática do pedido ${updatedOrder.id}:`, error);
        });
      }
    }

    return { order: updatedOrder, payment: updatedPayment };
  }
}
