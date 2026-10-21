import { IOrder, IPayment } from '../entities/order.entity';
import { IOrderRepository } from '../repositories/order.repository.interface';
import { IPaymentRepository } from '../repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../../notifications/domain/services/i-whatsapp-notification.service';

/**
 * specs/0140-confirmacao-automatica-pix REQ-1 — ponto único que marca o Pix como aprovado e, se
 * o pedido ainda estiver `aguardandoConfirmacao` e o restaurante tiver `pix` em
 * `autoConfirmPaymentMethods` (specs/0151), avança o pedido pra `confirmado` na mesma operação.
 * Usado tanto pela confirmação manual (`OrdersController`, `PATCH .../payment/confirm`, REQ-1a)
 * quanto pelo webhook gateway-agnóstico (`PaymentWebhookController`, REQ-1b) — garante o mesmo
 * comportamento independente de quem disparou, sem duplicar a regra em dois lugares.
 *
 * `order` já deve chegar validado pelo chamador (`Payment.method === 'pix'`,
 * `Payment.status === 'pendente'`) — o que varia por origem é a resposta de erro quando isso não
 * vale (manual: 409 imediato; webhook: idempotente em cima de reentrega), não a confirmação em
 * si, por isso essa validação fica fora deste serviço.
 */
export class ConfirmPixPaymentService {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
  ) {}

  async confirm(order: IOrder): Promise<{ order: IOrder; payment: IPayment }> {
    const updatedPayment = await this.paymentRepository.markAsApproved(order.id);

    // specs/0064-notificacao-whatsapp-pix-confirmado REQ-3 — fire-and-forget, mesmo padrão já
    // usado no resto do fluxo de pedidos: nunca bloqueia nem reverte a confirmação.
    void this.whatsAppNotificationService.sendPaymentConfirmedMessage(order).catch((error) => {
      console.error(`[whatsapp] erro inesperado enviando confirmação de pagamento do pedido ${order.id}:`, error);
    });

    let updatedOrder = order;
    if (order.status === 'aguardandoConfirmacao') {
      const restaurant = await this.restaurantRepository.findById(order.restaurantId);
      if (restaurant?.autoConfirmPaymentMethods?.includes('pix')) {
        updatedOrder = await this.orderRepository.updateStatus(order.id, 'confirmado', order.restaurantId);
        void this.whatsAppNotificationService.sendOrderStatusUpdate(updatedOrder).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando confirmação automática do pedido ${updatedOrder.id}:`, error);
        });
      }
    }

    return { order: updatedOrder, payment: updatedPayment };
  }
}
