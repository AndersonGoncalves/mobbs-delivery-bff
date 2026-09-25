import { buildOrderPixCode } from '../../orders/domain/build-order-pix-code';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { buildOrderReceiptMessage } from '../domain/order-receipt-message-builder';
import { buildPaymentConfirmedMessage } from '../domain/payment-confirmed-message-builder';
import { buildOrderStatusMessage } from '../domain/order-status-message-templates';
import { IWhatsAppNotificationService } from '../domain/services/i-whatsapp-notification.service';

/** Qual toggle de `Restaurant` liga/desliga a mensagem de cada status (`entregue` não tem toggle). */
const STATUS_TOGGLES: Partial<Record<IOrder['status'], keyof IRestaurant>> = {
  confirmado: 'notifyCustomerOnOrderConfirmed',
  emPreparo: 'notifyCustomerOnOrderPreparing',
  saiuParaEntrega: 'notifyCustomerOnOrderOutForDelivery',
  cancelado: 'notifyCustomerOnOrderCancelled',
};

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

      // specs/0069 — `=== false` (não `!`): documento antigo sem o campo conta como ligado.
      if (restaurant!.notifyCustomerOnOrderCreated === false) return;

      const message = buildOrderReceiptMessage({
        restaurant: {
          slug: restaurant!.slug,
          orderReceiptWhatsAppTemplate: restaurant!.orderReceiptWhatsAppTemplate,
        },
        customer: { name: customer!.name, phone: customer!.phone },
        order,
        cardBrand,
        pixCode: buildOrderPixCode(restaurant!, order),
      });

      await this.whatsAppConnectionService.sendMessage(restaurant!.id, customer!.phone!, message);
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

      // specs/0063/0065/0071 — toggle independente por status; `=== false` (não `!`) pra tratar um
      // documento antigo sem o campo (`undefined`) como ligado, mesmo default do schema.
      const toggle = STATUS_TOGGLES[order.status];
      if (toggle && restaurant![toggle] === false) return;

      const message = buildOrderStatusMessage({
        order,
        customerName: customer!.name,
        customerPhone: customer!.phone,
        restaurantSlug: restaurant!.slug,
        pixCode: buildOrderPixCode(restaurant!, order),
        reason,
        templates: {
          confirmado: restaurant.orderConfirmedWhatsAppTemplate,
          saiuParaEntrega: restaurant.orderOutForDeliveryWhatsAppTemplate,
          emPreparo: restaurant.orderPreparingWhatsAppTemplate,
          cancelado: restaurant.orderCancelledWhatsAppTemplate,
        },
      });
      if (!message) return;

      await this.whatsAppConnectionService.sendMessage(restaurant.id, customer.phone, message);
    } catch (error) {
      console.error(`[whatsapp] falha ao enviar atualização de status do pedido ${order.id}:`, error);
    }
  }

  async sendPaymentConfirmedMessage(order: IOrder): Promise<void> {
    try {
      const [customer, restaurant] = await Promise.all([
        this.customerRepository.findById(order.customerId),
        this.restaurantRepository.findById(order.restaurantId),
      ]);

      if (this.skipReason(order, customer, restaurant)) return;
      // `=== false` (não `!`): documento antigo sem o campo conta como ligado (mesmo default do schema).
      if (restaurant!.notifyCustomerOnPixConfirmed === false) return;

      const message = buildPaymentConfirmedMessage({
        template: restaurant!.pixConfirmedWhatsAppTemplate,
        order,
        customerName: customer!.name,
        customerPhone: customer!.phone,
        restaurantSlug: restaurant!.slug,
      });

      await this.whatsAppConnectionService.sendMessage(restaurant!.id, customer!.phone!, message);
    } catch (error) {
      console.error(`[whatsapp] falha ao enviar confirmação de pagamento do pedido ${order.id}:`, error);
    }
  }
}
