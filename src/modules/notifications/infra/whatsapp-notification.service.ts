import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { buildOrderReceiptMessage } from '../domain/order-receipt-message-builder';
import { buildOrderStatusMessage } from '../domain/order-status-message-templates';
import { IWhatsAppNotificationService } from '../domain/services/i-whatsapp-notification.service';

/**
 * specs/0013-notificacoes-whatsapp — `Order` não denormaliza dados de `Customer`/`Restaurant`
 * (só guarda `customerId`/`restaurantId`), então esta implementação busca os dois documentos
 * antes de montar a mensagem, mesmo padrão de lookup já usado pelo resto do BFF.
 */
export class WhatsAppNotificationService implements IWhatsAppNotificationService {
  constructor(
    private readonly whatsAppConnectionService: IWhatsAppConnectionService,
    private readonly customerRepository: ICustomerRepository,
    private readonly restaurantRepository: IRestaurantRepository,
  ) {}

  async sendOrderReceipt(order: IOrder, cardBrand?: string): Promise<void> {
    try {
      const [customer, restaurant] = await Promise.all([
        this.customerRepository.findById(order.customerId),
        this.restaurantRepository.findById(order.restaurantId),
      ]);

      // REQ-3 — sem telefone, pula silenciosamente. REQ-12 — sem conexão ativa, idem.
      if (!customer?.phone || !restaurant?.whatsappConnected) return;

      const message = buildOrderReceiptMessage({
        restaurant: {
          name: restaurant.name,
          slug: restaurant.slug,
          orderConfirmationGreeting: restaurant.orderConfirmationGreeting,
          pixKey: restaurant.pixKey,
          pixKeyType: restaurant.pixKeyType,
          pixBeneficiaryName: restaurant.pixBeneficiaryName,
        },
        customer: { name: customer.name },
        order,
        cardBrand,
      });

      await this.whatsAppConnectionService.sendMessage(restaurant.id, customer.phone, message);
    } catch (error) {
      // REQ-4 — nunca propaga: falha de envio não pode reverter/travar a criação do pedido.
      console.error(`[whatsapp] falha ao enviar recibo do pedido ${order.id}:`, error);
    }
  }

  async sendOrderStatusUpdate(order: IOrder, reason?: string): Promise<void> {
    try {
      const [customer, restaurant] = await Promise.all([
        this.customerRepository.findById(order.customerId),
        this.restaurantRepository.findById(order.restaurantId),
      ]);

      if (!customer?.phone || !restaurant?.whatsappConnected) return;

      const message = buildOrderStatusMessage(order.status, order.orderNumber, reason);
      if (!message) return;

      await this.whatsAppConnectionService.sendMessage(restaurant.id, customer.phone, message);
    } catch (error) {
      console.error(`[whatsapp] falha ao enviar atualização de status do pedido ${order.id}:`, error);
    }
  }
}
