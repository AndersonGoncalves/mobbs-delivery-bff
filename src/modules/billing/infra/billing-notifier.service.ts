import type { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import type { IBillingNotifier } from '../domain/recompute-restaurant-billing.use-case';
import type { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';

/**
 * specs/0042 REQ-3/REQ-4 — avisa o próprio restaurante pelo WhatsApp conectado dele. Nunca lança: falha de envio
 * não pode quebrar a mudança de status do pedido que disparou o cálculo.
 */
export class BillingNotifier implements IBillingNotifier {
  constructor(private readonly whatsAppConnectionService: IWhatsAppConnectionService) {}

  async notifyRestaurant(restaurant: IRestaurant, text: string): Promise<void> {
    if (!restaurant.phone) return;
    try {
      await this.whatsAppConnectionService.sendMessage(restaurant.id, restaurant.phone, text);
    } catch (error) {
      console.error(`[billing] falha ao avisar o restaurante ${restaurant.id} sobre o plano:`, error);
    }
  }
}
