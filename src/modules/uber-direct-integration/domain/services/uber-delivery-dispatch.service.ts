import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { ICustomerRepository } from '../../../customers/domain/repositories/customer.repository.interface';
import { UberDeliveryAddress, UberDirectClient } from '../../infra/uber-direct-client';
import { UberDirectAuthService } from '../../infra/uber-direct-auth.service';
import { IUberDeliveryConfig } from '../entities/uber-delivery-config.entity';

/** Fallback quando o restaurante não tem telefone cadastrado (`Restaurant.phone` é opcional) —
 * a Uber Direct exige um telefone no payload; nunca bloqueamos o despacho por isso. */
const UNKNOWN_PHONE_FALLBACK = '0000000000';

/**
 * specs/0121-integracao-uber-entregas REQ-2/REQ-4/REQ-5 — orquestra o despacho manual de uma
 * entrega via Uber Direct: pede cotação, e se aceita, cria a entrega. Nunca engole erro de
 * cotação recusada (REQ-5, mesmo raciocínio não-silencioso de `FiscalEmissionService.
 * cancelDocument`) — quem decide a resposta HTTP é o controller que chama este serviço.
 */
export class UberDeliveryDispatchService {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly authService: UberDirectAuthService,
    private readonly client: UberDirectClient,
  ) {}

  /**
   * Endereço de destino montado a partir de `Order.deliveryAddress` (string livre nesta versão do
   * sistema, `docs/architecture/data-model.md` §Order) — `city`/`state` herdados do cadastro do
   * restaurante como aproximação (suposição documentada, `plan.md`/`docs/UBER-DIRECT.md`).
   */
  private buildDropoffAddress(order: IOrder, restaurantCity: string, restaurantState: string): UberDeliveryAddress {
    return {
      streetAddress: order.deliveryAddress || 'Endereço não informado',
      city: restaurantCity,
      state: restaurantState,
      zipCode: '',
    };
  }

  async dispatch(order: IOrder, config: IUberDeliveryConfig): Promise<IOrder> {
    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    if (!restaurant) throw new Error('Restaurante não encontrado');

    const pickup: UberDeliveryAddress = {
      streetAddress: restaurant.address ? `${restaurant.address.street}` : restaurant.name,
      city: restaurant.address?.city ?? '',
      state: restaurant.address?.state ?? '',
      zipCode: config.originZipCode,
    };
    const dropoff = this.buildDropoffAddress(order, restaurant.address?.city ?? '', restaurant.address?.state ?? '');

    const accessToken = await this.authService.getAccessToken(config.clientId, config.clientSecret);

    // REQ-2/REQ-5 — a cotação pode ser recusada (fora de área, sem entregador disponível); nesta
    // chamada um erro da API já é propagado como está (nunca engolido), o controller decide a
    // resposta HTTP pro operador.
    const quote = await this.client.createQuote(accessToken, config.customerId, pickup, dropoff);

    const customer = await this.customerRepository.findById(order.customerId);

    const delivery = await this.client.createDelivery(accessToken, config.customerId, {
      quoteId: quote.id,
      pickup,
      pickupName: restaurant.name,
      pickupPhoneNumber: restaurant.phone || UNKNOWN_PHONE_FALLBACK,
      dropoff,
      dropoffName: customer?.name ?? 'Cliente',
      dropoffPhoneNumber: customer?.phone || UNKNOWN_PHONE_FALLBACK,
      manifestItems: order.items.map((item) => ({ name: item.productName, quantity: item.quantity })),
    });

    return this.orderRepository.updateUberDelivery(order.id, {
      status: 'solicitado',
      deliveryId: delivery.id,
      quoteId: quote.id,
      trackingUrl: delivery.tracking_url,
    });
  }
}
