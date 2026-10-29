import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurant } from '../../../restaurants/domain/entities/restaurant.entity';
import { ICustomerRepository } from '../../../customers/domain/repositories/customer.repository.interface';
import { EntregaAddress, NinetyNineFoodClient } from '../../infra/ninety-nine-food-client';

/**
 * specs/0130-integracao-99-entrega REQ-2/REQ-6 — orquestra o despacho manual de uma entrega via
 * 99 Entrega: pede cotação e, se aceita, cria a entrega numa única chamada (mesmo padrão
 * atômico de `UberDeliveryDispatchService`, specs/0121 — evita o problema do `estimate_id`
 * expirar/ser reaproveitado entre dois passos de UI). Nunca engole erro de cotação recusada —
 * quem decide a resposta HTTP é o controller que chama este serviço.
 */
export class NinetyNineFoodEntregaDispatchService {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly client: NinetyNineFoodClient,
  ) {}

  private buildPickupAddress(restaurant: IRestaurant): EntregaAddress {
    if (!restaurant.address) throw new Error('Restaurante sem endereço cadastrado — obrigatório para 99 Entrega');
    return {
      street: restaurant.address.street,
      number: restaurant.address.number,
      complement: restaurant.address.complement,
      neighborhood: restaurant.address.neighborhood,
      city: restaurant.address.city,
      state: restaurant.address.state,
      country: 'BRASIL',
      zipCode: restaurant.address.zipCode,
      name: restaurant.name,
      phone: restaurant.phone,
    };
  }

  private buildDropoffAddress(order: IOrder, customerName: string): EntregaAddress {
    const address = order.ninetyNineFoodDeliveryAddress;
    if (!address) throw new Error('Pedido sem endereço estruturado do cliente — não é possível despachar 99 Entrega');
    return {
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      country: address.country,
      zipCode: address.zipCode,
      lat: address.lat,
      lng: address.lng,
      name: customerName,
      // doc oficial não lista `phone` em `dropoff_info` (só em `pickup_info`) — nunca enviado aqui.
    };
  }

  async dispatch(order: IOrder, restaurant: IRestaurant): Promise<IOrder> {
    if (!restaurant.ninetyNineFoodAuthToken) throw new Error('Restaurante sem auth_token do 99Food — conecte a integração antes');
    if (!order.ninetyNineFoodOrderId) throw new Error('Pedido sem ninetyNineFoodOrderId — não é possível despachar 99 Entrega');

    const customer = await this.customerRepository.findById(order.customerId);
    const pickup = this.buildPickupAddress(restaurant);
    const dropoff = this.buildDropoffAddress(order, customer?.name ?? 'Cliente');

    const estimation = await this.client.estimateEntregaPrice(restaurant.ninetyNineFoodAuthToken, { pickup, dropoff });
    const placed = await this.client.placeEntregaOrder(restaurant.ninetyNineFoodAuthToken, order.ninetyNineFoodOrderId, estimation.estimateId, { pickup, dropoff });

    return this.orderRepository.updateEntregaDelivery(order.id, {
      status: 'solicitado',
      entregaOrderId: placed.entregaOrderId,
      estimateId: estimation.estimateId,
      fee: estimation.fee,
    });
  }
}
