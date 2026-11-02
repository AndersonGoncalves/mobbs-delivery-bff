import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { ICustomerSummaryRepository } from '../domain/repositories/customer-summary.repository.interface';
import { CustomerBalanceService } from '../../customer-balance/domain/services/customer-balance.service';
import { ICustomerBalanceRepository } from '../../customer-balance/domain/repositories/customer-balance.repository.interface';
import { CustomersSummaryController } from './customers-summary.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'query' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'> & Partial<Pick<Response, 'header'>>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    put: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PUT ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust-1',
    name: 'Maria Silva',
    phone: '11999990000',
    totalOrders: 3,
    totalSpent: 150.5,
    lastOrderAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function buildAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    customerId: 'cust-1',
    label: 'Casa',
    street: 'Rua A',
    number: '123',
    neighborhood: 'Centro',
    city: 'Fortaleza',
    state: 'CE',
    zipCode: '60000000',
    isDefault: true,
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 1,
    trackingToken: 'tok-1',
    customerId: 'cust-1',
    restaurantId: 'r-1',
    items: [],
    orderType: 'delivery',
    status: 'entregue',
    statusHistory: [],
    subtotal: 100,
    deliveryFee: 0,
    discount: 0,
    total: 100,
    paymentMethod: 'pix',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('CustomersSummaryController (specs/0016-clientes-retaguarda)', () => {
  function setup(
    overrides: {
      customerSummaryRepository?: Partial<ICustomerSummaryRepository>;
      orderRepository?: Partial<IOrderRepository>;
      addressRepository?: Partial<IAddressRepository>;
      customerRepository?: Partial<ICustomerRepository>;
    } = {},
  ) {
    const customerSummaryRepository: Partial<ICustomerSummaryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildSummary()]),
      // Achado de auditoria (2026-10-31) — só usado quando a requisição manda page/pageSize (ver
      // `resolvePagination`); default devolve 1 cliente / total 1, testes específicos sobrescrevem.
      listByRestaurantPage: jest.fn().mockResolvedValue({ items: [buildSummary()], total: 1 }),
      ...overrides.customerSummaryRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([buildOrder()]),
      ...overrides.orderRepository,
    };
    const addressRepository: Partial<IAddressRepository> = {
      listByCustomer: jest.fn().mockResolvedValue([buildAddress()]),
      create: jest.fn().mockResolvedValue(buildAddress({ id: 'addr-novo' })),
      update: jest.fn().mockResolvedValue(buildAddress({ label: 'Trabalho' })),
      findById: jest.fn().mockResolvedValue(buildAddress()),
      ...overrides.addressRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      createByRestaurant: jest.fn().mockResolvedValue({ id: 'cust-novo', name: 'Novo Cliente', email: 'x@retaguarda.mobbs-delivery.local', phone: '5511999990000' }),
      findById: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Maria Silva', email: 'maria@example.com', phone: '5511999990000', document: '12345678901' }),
      upsertProfile: jest.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
      ...overrides.customerRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const customerBalanceRepository: Partial<ICustomerBalanceRepository> = {
      getOrCreate: jest.fn().mockResolvedValue({ id: 'cb-1', customerId: 'cust-1', restaurantId: 'r-1', balance: 0, loyaltyStampCount: 0, updatedAt: '' }),
      getHistory: jest.fn().mockResolvedValue([]),
    };
    const customerBalanceService = new CustomerBalanceService(customerBalanceRepository as ICustomerBalanceRepository);
    const { application, routes } = buildFakeApplication();
    new CustomersSummaryController(
      customerSummaryRepository as ICustomerSummaryRepository,
      orderRepository as IOrderRepository,
      restaurantOperatorMiddleware,
      addressRepository as IAddressRepository,
      customerBalanceService,
      customerRepository as ICustomerRepository,
    ).initializeRoutes(application);
    return { customerSummaryRepository, orderRepository, addressRepository, customerBalanceRepository, customerRepository, routes };
  }

  it('AC-1: GET /restaurants/me/customers-summary lista os clientes do restaurante do operador', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json });

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', undefined, undefined, undefined);
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ customerId: 'cust-1', totalOrders: 3, totalSpent: 150.5 })]);
  });

  it('AC-2: GET .../customers-summary?search= repassa o termo de busca pro repositório', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary'],
      { restaurantId: 'r-1', query: { search: 'Maria' } },
      { json },
    );

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', 'Maria', undefined, undefined);
  });

  // Pedido explícito do usuário (follow-up) — filtro de período pra totalOrders/totalSpent.
  it('GET .../customers-summary?fromDate=&toDate= converte pra Date (início/fim do dia) e repassa pro repositório', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary'],
      { restaurantId: 'r-1', query: { fromDate: '2026-09-01', toDate: '2026-09-30' } },
      { json },
    );

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith(
      'r-1',
      undefined,
      new Date('2026-09-01T00:00:00.000'),
      new Date('2026-09-30T23:59:59.999'),
    );
  });

  it('AC-4: repositório é a fonte da ordenação padrão (decrescente por total gasto) — o controller só repassa a lista', async () => {
    const { routes } = setup({
      customerSummaryRepository: {
        listByRestaurant: jest.fn().mockResolvedValue([
          buildSummary({ customerId: 'cust-1', totalSpent: 300 }),
          buildSummary({ customerId: 'cust-2', totalSpent: 100 }),
        ]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json });

    const [, body] = json.mock.calls[0];
    expect(body.map((item: { customerId: string }) => item.customerId)).toEqual(['cust-1', 'cust-2']);
  });

  // Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
  // histórico inteiro", mesmo padrão de `/restaurants/me/products`.
  it('achado de auditoria (2026-10-31): sem page/pageSize, GET .../customers-summary continua devolvendo a lista inteira (sem header de total)', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();
    const header = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json, header });

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledTimes(1);
    expect(customerSummaryRepository.listByRestaurantPage).not.toHaveBeenCalled();
    expect(header).not.toHaveBeenCalled();
  });

  it('achado de auditoria (2026-10-31): com page/pageSize, pagina no servidor e manda o total real no header X-Total-Count', async () => {
    const { customerSummaryRepository, routes } = setup({
      customerSummaryRepository: { listByRestaurantPage: jest.fn().mockResolvedValue({ items: [buildSummary()], total: 142 }) },
    });
    const json = jest.fn();
    const header = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary'],
      { restaurantId: 'r-1', query: { page: '3', pageSize: '20', search: 'Maria' } },
      { json, header },
    );

    expect(customerSummaryRepository.listByRestaurant).not.toHaveBeenCalled();
    expect(customerSummaryRepository.listByRestaurantPage).toHaveBeenCalledWith('r-1', { skip: 40, limit: 20 }, 'Maria', undefined, undefined);
    expect(header).toHaveBeenCalledWith('X-Total-Count', '142');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ customerId: 'cust-1' })]);
  });

  it('AC-3: GET .../customers-summary/:customerId/orders busca o histórico escopado ao restaurante do operador', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/orders'],
      { restaurantId: 'r-1', params: { customerId: 'cust-1' } },
      { json },
    );

    expect(orderRepository.findManyByCustomerAndRestaurant).toHaveBeenCalledWith('cust-1', 'r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'ord-1', restaurantId: 'r-1' })]);
  });

  // Pedido explícito do usuário (follow-up) — "ver endereços" do cliente, mesmo padrão de "ver
  // pedidos".
  it('GET .../customers-summary/:customerId/addresses devolve os endereços de um cliente que já pediu neste restaurante', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/addresses'],
      { restaurantId: 'r-1', params: { customerId: 'cust-1' } },
      { json },
    );

    expect(addressRepository.listByCustomer).toHaveBeenCalledWith('cust-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'addr-1', customerId: 'cust-1' })]);
  });

  it('GET .../addresses de um cliente que NUNCA pediu neste restaurante devolve lista vazia, sem consultar os endereços', async () => {
    const { addressRepository, routes } = setup({
      orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/addresses'],
      { restaurantId: 'r-1', params: { customerId: 'cust-outro-restaurante' } },
      { json },
    );

    expect(addressRepository.listByCustomer).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, []);
  });

  // (achado real, pedido explícito do usuário) — "NOVO" em Clientes.
  it('POST /restaurants/me/customers cadastra um cliente avulso com o telefone normalizado', async () => {
    const { customerRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/customers'],
      { restaurantId: 'r-1', body: { name: 'Novo Cliente', phone: '(55) 11 99999-0000' } },
      { json },
    );

    expect(customerRepository.createByRestaurant).toHaveBeenCalledWith('r-1', 'Novo Cliente', '5511999990000');
    expect(json).toHaveBeenCalledWith(201, { customerId: 'cust-novo', name: 'Novo Cliente', phone: '5511999990000' });
  });

  it('POST /restaurants/me/customers sem telefone é rejeitado (400)', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/customers'], { restaurantId: 'r-1', body: { name: 'Novo Cliente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Pedido explícito do usuário — editar dados do cliente pela retaguarda.
  describe('PUT /restaurants/me/customers-summary/:customerId', () => {
    it('atualiza nome/telefone, normaliza o telefone e preserva email/document existentes', async () => {
      const { customerRepository, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(
        routes['PUT /restaurants/me/customers-summary/:customerId'],
        { restaurantId: 'r-1', params: { customerId: 'cust-1' }, body: { name: 'Maria Souza', phone: '(55) 11 99999-0000' } },
        { json },
      );

      expect(customerRepository.upsertProfile).toHaveBeenCalledWith('cust-1', {
        name: 'Maria Souza',
        email: 'maria@example.com',
        phone: '5511999990000',
        document: '12345678901',
      });
      expect(json).toHaveBeenCalledWith(200, { customerId: 'cust-1', name: 'Maria Souza', phone: '5511999990000' });
    });

    it('edição parcial (só nome) mantém o telefone atual', async () => {
      const { customerRepository, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(
        routes['PUT /restaurants/me/customers-summary/:customerId'],
        { restaurantId: 'r-1', params: { customerId: 'cust-1' }, body: { name: 'Maria Souza' } },
        { json },
      );

      expect(customerRepository.upsertProfile).toHaveBeenCalledWith(
        'cust-1',
        expect.objectContaining({ name: 'Maria Souza', phone: '5511999990000' }),
      );
    });

    it('sem nome nem telefone é rejeitado (400), sem tocar no repositório', async () => {
      const { customerRepository, routes } = setup();

      await expect(
        runOperatorChain(
          routes['PUT /restaurants/me/customers-summary/:customerId'],
          { restaurantId: 'r-1', params: { customerId: 'cust-1' }, body: {} },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(customerRepository.upsertProfile).not.toHaveBeenCalled();
    });

    it('cliente que nunca pediu neste restaurante e não foi cadastrado por ele é rejeitado (404)', async () => {
      const { customerRepository, routes } = setup({
        orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        runOperatorChain(
          routes['PUT /restaurants/me/customers-summary/:customerId'],
          { restaurantId: 'r-1', params: { customerId: 'cust-outro-restaurante' }, body: { name: 'X' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(customerRepository.upsertProfile).not.toHaveBeenCalled();
    });

    // Diferente das rotas de leitura (GET .../addresses, GET .../balance) — um cliente cadastrado
    // manualmente ANTES de qualquer pedido também pode ser editado.
    it('cliente cadastrado manualmente por este restaurante (createdByRestaurantId), ainda sem pedido, pode ser editado', async () => {
      const { customerRepository, routes } = setup({
        orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
        customerRepository: {
          findById: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Maria Silva', email: 'maria@example.com', createdByRestaurantId: 'r-1' }),
        },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PUT /restaurants/me/customers-summary/:customerId'],
        { restaurantId: 'r-1', params: { customerId: 'cust-1' }, body: { name: 'Maria Souza' } },
        { json },
      );

      expect(customerRepository.upsertProfile).toHaveBeenCalled();
    });
  });

  // Pedido explícito do usuário — incluir endereço novo pro cliente, pela retaguarda.
  describe('POST /restaurants/me/customers-summary/:customerId/addresses', () => {
    it('cria o endereço pro cliente deste restaurante', async () => {
      const { addressRepository, routes } = setup();
      const json = jest.fn();
      const input = { label: 'Trabalho', street: 'Rua B', number: '456', neighborhood: 'Centro', city: 'Fortaleza', state: 'CE', zipCode: '60000000' };

      await runOperatorChain(
        routes['POST /restaurants/me/customers-summary/:customerId/addresses'],
        { restaurantId: 'r-1', params: { customerId: 'cust-1' }, body: input },
        { json },
      );

      expect(addressRepository.create).toHaveBeenCalledWith('cust-1', input);
      expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'addr-novo' }));
    });

    it('cliente que não pertence a este restaurante é rejeitado (404), sem criar o endereço', async () => {
      const { addressRepository, routes } = setup({
        orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/customers-summary/:customerId/addresses'],
          { restaurantId: 'r-1', params: { customerId: 'cust-outro-restaurante' }, body: { label: 'Casa' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(addressRepository.create).not.toHaveBeenCalled();
    });
  });

  // Pedido explícito do usuário — alterar um endereço já cadastrado do cliente, pela retaguarda.
  describe('PUT /restaurants/me/customers-summary/:customerId/addresses/:addressId', () => {
    it('atualiza o endereço do cliente deste restaurante', async () => {
      const { addressRepository, routes } = setup();
      const json = jest.fn();
      const input = { label: 'Trabalho', street: 'Rua B', number: '456', neighborhood: 'Centro', city: 'Fortaleza', state: 'CE', zipCode: '60000000' };

      await runOperatorChain(
        routes['PUT /restaurants/me/customers-summary/:customerId/addresses/:addressId'],
        { restaurantId: 'r-1', params: { customerId: 'cust-1', addressId: 'addr-1' }, body: input },
        { json },
      );

      expect(addressRepository.update).toHaveBeenCalledWith('addr-1', input);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ label: 'Trabalho' }));
    });

    it('endereço que pertence a outro cliente é rejeitado (404), sem atualizar', async () => {
      const { addressRepository, routes } = setup({
        addressRepository: { findById: jest.fn().mockResolvedValue(buildAddress({ customerId: 'cust-outro' })) },
      });

      await expect(
        runOperatorChain(
          routes['PUT /restaurants/me/customers-summary/:customerId/addresses/:addressId'],
          { restaurantId: 'r-1', params: { customerId: 'cust-1', addressId: 'addr-1' }, body: { label: 'Casa' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(addressRepository.update).not.toHaveBeenCalled();
    });

    it('cliente que não pertence a este restaurante é rejeitado (404), sem checar o endereço', async () => {
      const { addressRepository, routes } = setup({
        orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        runOperatorChain(
          routes['PUT /restaurants/me/customers-summary/:customerId/addresses/:addressId'],
          { restaurantId: 'r-1', params: { customerId: 'cust-outro-restaurante', addressId: 'addr-1' }, body: { label: 'Casa' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(addressRepository.findById).not.toHaveBeenCalled();
      expect(addressRepository.update).not.toHaveBeenCalled();
    });
  });
});
