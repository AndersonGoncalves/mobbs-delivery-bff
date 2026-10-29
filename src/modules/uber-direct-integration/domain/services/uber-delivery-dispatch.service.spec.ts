import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant } from '../../../restaurants/domain/entities/restaurant.entity';
import { ICustomerRepository } from '../../../customers/domain/repositories/customer.repository.interface';
import { ICustomer } from '../../../customers/domain/entities/customer.entity';
import { UberDirectAuthService } from '../../infra/uber-direct-auth.service';
import { UberDirectClient } from '../../infra/uber-direct-client';
import { IUberDeliveryConfig } from '../entities/uber-delivery-config.entity';
import { UberDeliveryDispatchService } from './uber-delivery-dispatch.service';

jest.mock('../../infra/uber-direct-auth.service');
jest.mock('../../infra/uber-direct-client');

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 1,
    trackingToken: 'tok-1',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 2, unitPrice: 30 }],
    orderType: 'delivery',
    status: 'emPreparo',
    statusHistory: [],
    subtotal: 60,
    deliveryFee: 5,
    discount: 0,
    total: 65,
    paymentMethod: 'pix',
    deliveryAddress: 'Rua das Flores, 123',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    whatsappConnected: false,
    acceptedPaymentMethods: ['pix'],
    phone: '11999990000',
    address: { street: 'Av. Central, 1', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01000000' },
    ...overrides,
  } as IRestaurant;
}

function buildCustomer(overrides: Partial<ICustomer> = {}): ICustomer {
  return { id: 'c-1', name: 'João', phone: '11988880000', ...overrides } as ICustomer;
}

function buildConfig(overrides: Partial<IUberDeliveryConfig> = {}): IUberDeliveryConfig {
  return {
    restaurantId: 'r-1',
    customerId: 'uber-customer-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    originZipCode: '01000000',
    webhookToken: 'webhook-token-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('UberDeliveryDispatchService (specs/0121-integracao-uber-entregas)', () => {
  const MockedAuth = UberDirectAuthService as jest.MockedClass<typeof UberDirectAuthService>;
  const MockedClient = UberDirectClient as jest.MockedClass<typeof UberDirectClient>;

  beforeEach(() => {
    MockedAuth.mockClear();
    MockedClient.mockClear();
    MockedAuth.prototype.getAccessToken = jest.fn().mockResolvedValue('access-token-1');
    MockedClient.prototype.createQuote = jest.fn();
    MockedClient.prototype.createDelivery = jest.fn();
  });

  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    customerRepository?: Partial<ICustomerRepository>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      updateUberDelivery: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue(buildCustomer()),
      ...overrides.customerRepository,
    };
    const service = new UberDeliveryDispatchService(
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      customerRepository as ICustomerRepository,
      new MockedAuth(),
      new MockedClient(),
    );
    return { service, orderRepository, restaurantRepository, customerRepository };
  }

  describe('dispatch (REQ-2)', () => {
    it('AC-2: cotação aceita cria a entrega e grava Order.uberDelivery como "solicitado"', async () => {
      MockedClient.prototype.createQuote = jest.fn().mockResolvedValue({ id: 'quote-1', kind: 'delivery_quote', fee: 1200, currency: 'BRL' });
      MockedClient.prototype.createDelivery = jest.fn().mockResolvedValue({ id: 'del-1', status: 'pending', tracking_url: 'https://track.uber.com/del-1' });
      const { service, orderRepository } = setup();

      await service.dispatch(buildOrder(), buildConfig());

      expect(MockedClient.prototype.createQuote).toHaveBeenCalledWith('access-token-1', 'uber-customer-1', expect.any(Object), expect.any(Object));
      expect(MockedClient.prototype.createDelivery).toHaveBeenCalledWith(
        'access-token-1',
        'uber-customer-1',
        expect.objectContaining({ quoteId: 'quote-1', pickupName: 'Prime Pizza', dropoffName: 'João' }),
      );
      expect(orderRepository.updateUberDelivery).toHaveBeenCalledWith('o-1', {
        status: 'solicitado',
        deliveryId: 'del-1',
        quoteId: 'quote-1',
        trackingUrl: 'https://track.uber.com/del-1',
      });
    });

    it('AC-4/REQ-5: cotação recusada (fora de área) lança — controller decide a resposta HTTP', async () => {
      MockedClient.prototype.createQuote = jest.fn().mockRejectedValue(new Error('Uber Direct API (POST /delivery_quotes) respondeu 422: fora da área de cobertura'));
      const { service, orderRepository } = setup();

      await expect(service.dispatch(buildOrder(), buildConfig())).rejects.toThrow('fora da área de cobertura');
      expect(MockedClient.prototype.createDelivery).not.toHaveBeenCalled();
      expect(orderRepository.updateUberDelivery).not.toHaveBeenCalled();
    });

    it('usa o CEP de origem configurado (não o CEP do cadastro do restaurante) no pickup', async () => {
      MockedClient.prototype.createQuote = jest.fn().mockResolvedValue({ id: 'quote-1', kind: 'delivery_quote', fee: 1200, currency: 'BRL' });
      MockedClient.prototype.createDelivery = jest.fn().mockResolvedValue({ id: 'del-1', status: 'pending' });
      const { service } = setup();

      await service.dispatch(buildOrder(), buildConfig({ originZipCode: '09999000' }));

      const [, , pickup] = MockedClient.prototype.createQuote.mock.calls[0];
      expect(pickup).toEqual(expect.objectContaining({ zipCode: '09999000' }));
    });
  });
});
