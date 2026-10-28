import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IFoodAuthService } from '../infra/ifood-auth.service';
import { IFoodClient } from '../infra/ifood-client';
import { mapIFoodOrderToNewOrderInput } from './ifood-order-mapper';

/**
 * specs/0090-integracao-ifood REQ-2/REQ-3/REQ-4 — polling de eventos por restaurante com
 * integração ativa, chamado periodicamente (`main.ts`, `setInterval`, mesmo precedente real já
 * em produção pro publicador de automação de Instagram — ver comentário lá). Cada restaurante
 * falha isoladamente (try/catch por item), mesmo raciocínio de
 * `PublishDueInstagramPostsService`: uma credencial inválida ou API fora do ar de UM restaurante
 * nunca impede o polling dos demais.
 *
 * Só reage ao código de evento `"PLC"` (pedido colocado) — outros códigos (confirmação,
 * despacho, etc. feitos do lado do iFood) não geram efeito aqui nesta v1 (plan.md: "fora de
 * escopo" já cobre dispatch/conciliação; eventos de status que não criam pedido novo são só
 * reconhecidos, sem ação adicional).
 */
const PLACED_EVENT_CODE = 'PLC';

export class IFoodPollingWorker {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly authService: IFoodAuthService,
    private readonly ifoodClient: IFoodClient,
  ) {}

  async run(): Promise<void> {
    const restaurants = await this.restaurantRepository.listAll();
    const connected = restaurants.filter((restaurant) => restaurant.ifoodMerchantId && restaurant.ifoodClientId && restaurant.ifoodClientSecret);

    for (const restaurant of connected) {
      try {
        await this.pollRestaurant(restaurant.id, restaurant.ifoodMerchantId!, restaurant.ifoodClientId!, restaurant.ifoodClientSecret!);
      } catch (error) {
        console.error(`[ifood-integration] erro inesperado no polling do restaurante ${restaurant.id}:`, error);
      }
    }
  }

  private async pollRestaurant(restaurantId: string, merchantId: string, clientId: string, clientSecret: string): Promise<void> {
    const accessToken = await this.authService.getAccessToken(clientId, clientSecret);

    const events = await this.ifoodClient.getEvents(accessToken, merchantId);
    if (events.length === 0) return;

    const acknowledgedIds: string[] = [];
    for (const event of events) {
      try {
        if (event.code === PLACED_EVENT_CODE) {
          const ifoodOrder = await this.ifoodClient.getOrderDetails(accessToken, event.orderId);
          const phone = typeof ifoodOrder.customer.phone === 'string' ? ifoodOrder.customer.phone : ifoodOrder.customer.phone?.number;
          const customer = await this.customerRepository.createStandalone(ifoodOrder.customer.name, phone);
          const input = mapIFoodOrderToNewOrderInput(ifoodOrder, restaurantId, customer.id);
          await this.orderRepository.create(input);
        }
        acknowledgedIds.push(event.id);
      } catch (error) {
        console.error(`[ifood-integration] erro inesperado processando evento ${event.id} (pedido ${event.orderId}):`, error);
      }
    }

    // REQ-4 — confirma só os eventos que terminaram de processar (com sucesso OU erro já
    // tratado/logado acima); nunca reconhece um evento que ainda nem tentou processar.
    await this.ifoodClient.acknowledgeEvents(accessToken, acknowledgedIds);
  }
}
