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

      // REQ-3 — sem telefone, pula. REQ-12 — sem conexão ativa, idem. specs/0066 REQ-3: sempre
      // com log do motivo (antes era silencioso e a falha ficava invisível).
      if (this.skipReason(order, customer, restaurant)) return;

      const message = buildOrderReceiptMessage({
        restaurant: {
          name: restaurant!.name,
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

  /** specs/0066 REQ-3 — `true` (e já logou o motivo) quando o envio deve ser pulado. */
  private skipReason(
    order: IOrder,
    customer: { phone?: string } | null,
    restaurant: { whatsappConnected: boolean } | null,
  ): boolean {
    if (!customer?.phone) {
      console.warn(`[whatsapp] pedido ${order.id}: mensagem não enviada — cliente sem telefone cadastrado`);
      return true;
    }
    if (!restaurant?.whatsappConnected) {
      console.warn(`[whatsapp] pedido ${order.id}: mensagem não enviada — WhatsApp do restaurante não está conectado`);
      return true;
    }
    return false;
  }

  async sendOrderStatusUpdate(order: IOrder, reason?: string): Promise<void> {
    try {
      const [customer, restaurant] = await Promise.all([
        this.customerRepository.findById(order.customerId),
        this.restaurantRepository.findById(order.restaurantId),
      ]);

      if (this.skipReason(order, customer, restaurant)) return;

      // specs/0063-notificacao-whatsapp-pedido-confirmado REQ-3/REQ-4 — `=== false` (não `!`) pra
      // tratar um documento antigo sem o campo (`undefined`) como ligado, mesmo default do schema.
      if (order.status === 'confirmado' && restaurant.notifyCustomerOnOrderConfirmed === false) return;

      const message = buildOrderStatusMessage({
        order,
        customerName: customer.name,
        customerPhone: customer.phone,
        reason,
        templates: { confirmado: restaurant.orderConfirmedWhatsAppTemplate },
      });
      if (!message) return;

      await this.whatsAppConnectionService.sendMessage(restaurant.id, customer.phone, message);
    } catch (error) {
      console.error(`[whatsapp] falha ao enviar atualização de status do pedido ${order.id}:`, error);
    }
  }
}
