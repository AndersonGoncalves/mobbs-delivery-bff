import { IFoodPollingWorker } from './ifood-polling-worker';
import { IFoodAuthService } from '../infra/ifood-auth.service';
import { IFoodClient, IFoodOrderDetails } from '../infra/ifood-client';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'prime-pizza', isActive: true, businessHours: [], minimumOrderValue: 0, ...overrides } as IRestaurant;
}

function buildIFoodOrder(overrides: Partial<IFoodOrderDetails> = {}): IFoodOrderDetails {
  return {
    id: 'ifood-o-1',
    displayId: '123',
    orderType: 'DELIVERY',
    customer: { name: 'Ana', phone: '11999999999' },
    items: [{ id: 'i-1', name: 'Pizza', quantity: 1, unitPrice: { value: 40 }, totalPrice: { value: 40 } }],
    total: { orderAmount: { value: 40 } },
    ...overrides,
  };
}

describe('IFoodPollingWorker (specs/0090-integracao-ifood REQ-2/REQ-3/REQ-4)', () => {
  function build(restaurants: IRestaurant[]) {
    const restaurantRepository = { listAll: jest.fn().mockResolvedValue(restaurants) } as unknown as IRestaurantRepository;
    const customerRepository = { createStandalone: jest.fn().mockResolvedValue({ id: 'cust-1' }) } as unknown as ICustomerRepository;
    const orderRepository = { create: jest.fn().mockResolvedValue({ id: 'o-1' }) } as unknown as IOrderRepository;
    const authService = { getAccessToken: jest.fn().mockResolvedValue('token-1') } as unknown as IFoodAuthService;
    const ifoodClient = {
      getEvents: jest.fn().mockResolvedValue([]),
      acknowledgeEvents: jest.fn().mockResolvedValue(undefined),
      getOrderDetails: jest.fn().mockResolvedValue(buildIFoodOrder()),
      confirmOrder: jest.fn(),
      requestCancellation: jest.fn(),
    } as unknown as jest.Mocked<IFoodClient>;

    const worker = new IFoodPollingWorker(restaurantRepository, customerRepository, orderRepository, authService, ifoodClient);
    return { worker, restaurantRepository, customerRepository, orderRepository, authService, ifoodClient };
  }

  it('ignora restaurantes sem credencial do iFood configurada', async () => {
    const { worker, ifoodClient } = build([buildRestaurant({ ifoodMerchantId: undefined })]);

    await worker.run();

    expect(ifoodClient.getEvents).not.toHaveBeenCalled();
  });

  it('AC-2: evento "pedido colocado" (PLC) cria um Order interno com source "ifood" e reconhece o evento', async () => {
    const { worker, customerRepository, orderRepository, ifoodClient } = build([
      buildRestaurant({ ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' }),
    ]);
    (ifoodClient.getEvents as jest.Mock).mockResolvedValue([{ id: 'e-1', code: 'PLC', orderId: 'ifood-o-1', createdAt: '2026-10-28T00:00:00Z' }]);

    await worker.run();

    expect(ifoodClient.getEvents).toHaveBeenCalledWith('token-1', 'merchant-1');
    expect(customerRepository.createStandalone).toHaveBeenCalledWith('Ana', '11999999999');
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: 'r-1', customerId: 'cust-1', source: 'ifood' }));
    expect(ifoodClient.acknowledgeEvents).toHaveBeenCalledWith('token-1', ['e-1']);
  });

  it('eventos que não são "pedido colocado" só são reconhecidos, sem criar Order', async () => {
    const { worker, orderRepository, ifoodClient } = build([
      buildRestaurant({ ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' }),
    ]);
    (ifoodClient.getEvents as jest.Mock).mockResolvedValue([{ id: 'e-2', code: 'CFM', orderId: 'ifood-o-1', createdAt: '2026-10-28T00:00:00Z' }]);

    await worker.run();

    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(ifoodClient.acknowledgeEvents).toHaveBeenCalledWith('token-1', ['e-2']);
  });

  it('AC-2: não duplica — um restaurante com erro no polling não impede os demais', async () => {
    const { worker, ifoodClient, authService } = build([
      buildRestaurant({ id: 'r-1', ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' }),
      buildRestaurant({ id: 'r-2', ifoodMerchantId: 'merchant-2', ifoodClientId: 'client-2', ifoodClientSecret: 'secret-2' }),
    ]);
    (authService.getAccessToken as jest.Mock).mockRejectedValueOnce(new Error('credencial inválida')).mockResolvedValueOnce('token-2');

    await worker.run();

    expect(ifoodClient.getEvents).toHaveBeenCalledWith('token-2', 'merchant-2');
  });

  it('um evento que falha ao processar não é reconhecido, mas os demais continuam', async () => {
    const { worker, orderRepository, ifoodClient } = build([
      buildRestaurant({ ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' }),
    ]);
    (ifoodClient.getEvents as jest.Mock).mockResolvedValue([
      { id: 'e-1', code: 'PLC', orderId: 'ifood-o-1', createdAt: '2026-10-28T00:00:00Z' },
      { id: 'e-2', code: 'PLC', orderId: 'ifood-o-2', createdAt: '2026-10-28T00:00:01Z' },
    ]);
    (orderRepository.create as jest.Mock).mockRejectedValueOnce(new Error('falha ao criar')).mockResolvedValueOnce({ id: 'o-2' });

    await worker.run();

    expect(ifoodClient.acknowledgeEvents).toHaveBeenCalledWith('token-1', ['e-2']);
  });
});
