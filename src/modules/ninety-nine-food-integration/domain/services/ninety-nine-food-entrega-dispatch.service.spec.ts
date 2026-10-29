import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurant } from '../../../restaurants/domain/entities/restaurant.entity';
import { ICustomerRepository } from '../../../customers/domain/repositories/customer.repository.interface';
import { NinetyNineFoodClient } from '../../infra/ninety-nine-food-client';
import { NinetyNineFoodEntregaDispatchService } from './ninety-nine-food-entrega-dispatch.service';

jest.mock('../../infra/ninety-nine-food-client');

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'order-1',
    orderNumber: 1,
    trackingToken: 'token-1',
    customerId: 'customer-1',
    restaurantId: 'restaurant-1',
    items: [],
    orderType: 'delivery',
    source: '99food',
    ninetyNineFoodOrderId: '5764687801396298500',
    ninetyNineFoodDeliveryAddress: {
      street: 'Rua B', number: '2', neighborhood: 'Centro', city: 'SP', state: 'SP', country: 'BRASIL', zipCode: '02000-000', lat: -21, lng: -51,
    },
    status: 'emPreparo',
    statusHistory: [],
    subtotal: 20,
    deliveryFee: 5,
    discount: 0,
    total: 25,
    paymentMethod: 'creditCardOnline',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as IOrder;
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    id: 'restaurant-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    address: { street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'SP', state: 'SP', zipCode: '01000-000' },
    phone: '11999990000',
    ninetyNineFoodAuthToken: 'token-abc',
    ...overrides,
  } as IRestaurant;
}

describe('NinetyNineFoodEntregaDispatchService (specs/0130-integracao-99-entrega REQ-2/REQ-6)', () => {
  function setup() {
    const orderRepository: Partial<IOrderRepository> = {
      updateEntregaDelivery: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: { status: 'solicitado' } })),
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana' }),
    };
    const MockedClient = NinetyNineFoodClient as jest.MockedClass<typeof NinetyNineFoodClient>;
    const client = new MockedClient('https://openapi.99food.com');
    client.estimateEntregaPrice = jest.fn().mockResolvedValue({ estimateId: 'estimate-1', fee: 600, currency: 'R$', expiresAt: 123 });
    client.placeEntregaOrder = jest.fn().mockResolvedValue({ entregaOrderId: 'entrega-99' });

    const service = new NinetyNineFoodEntregaDispatchService(orderRepository as IOrderRepository, customerRepository as ICustomerRepository, client);
    return { orderRepository, customerRepository, client, service };
  }

  it('AC-2: cotação e criação acontecem numa única chamada e persistem entregaDelivery', async () => {
    const { client, orderRepository, service } = setup();

    await service.dispatch(buildOrder(), buildRestaurant());

    expect(client.estimateEntregaPrice).toHaveBeenCalledWith(
      'token-abc',
      expect.objectContaining({
        pickup: expect.objectContaining({ street: 'Rua A', name: 'Prime Pizza', phone: '11999990000' }),
        dropoff: expect.objectContaining({ street: 'Rua B', name: 'Ana' }),
      }),
    );
    expect(client.placeEntregaOrder).toHaveBeenCalledWith('token-abc', '5764687801396298500', 'estimate-1', expect.anything());
    expect(orderRepository.updateEntregaDelivery).toHaveBeenCalledWith('order-1', {
      status: 'solicitado',
      entregaOrderId: 'entrega-99',
      estimateId: 'estimate-1',
      fee: 600,
    });
  });

  it('dropoff nunca inclui telefone (doc oficial não lista phone em dropoff_info)', async () => {
    const { client, service } = setup();

    await service.dispatch(buildOrder(), buildRestaurant());

    const call = (client.estimateEntregaPrice as jest.Mock).mock.calls[0][1];
    expect(call.dropoff.phone).toBeUndefined();
  });

  it('AC-5: recusa (erro propagado) quando a cotação falha, sem persistir nada', async () => {
    const { client, orderRepository, service } = setup();
    client.estimateEntregaPrice = jest.fn().mockRejectedValue(new Error('fora de área'));

    await expect(service.dispatch(buildOrder(), buildRestaurant())).rejects.toThrow('fora de área');
    expect(orderRepository.updateEntregaDelivery).not.toHaveBeenCalled();
  });

  it('recusa quando o pedido não tem ninetyNineFoodOrderId', async () => {
    const { service } = setup();

    await expect(service.dispatch(buildOrder({ ninetyNineFoodOrderId: undefined }), buildRestaurant())).rejects.toThrow('ninetyNineFoodOrderId');
  });

  it('recusa quando o pedido não tem endereço estruturado do cliente', async () => {
    const { service } = setup();

    await expect(service.dispatch(buildOrder({ ninetyNineFoodDeliveryAddress: undefined }), buildRestaurant())).rejects.toThrow('endereço estruturado');
  });

  it('recusa quando o restaurante não tem endereço cadastrado', async () => {
    const { service } = setup();

    await expect(service.dispatch(buildOrder(), buildRestaurant({ address: undefined }))).rejects.toThrow('endereço cadastrado');
  });

  it('recusa quando o restaurante não tem auth_token do 99Food', async () => {
    const { service } = setup();

    await expect(service.dispatch(buildOrder(), buildRestaurant({ ninetyNineFoodAuthToken: undefined }))).rejects.toThrow('auth_token');
  });
});
