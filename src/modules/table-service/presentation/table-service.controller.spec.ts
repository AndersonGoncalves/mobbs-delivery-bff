import type { Request, Response, Server } from 'restify';
import { IRestaurantTableRepository } from '../domain/repositories/table.repository.interface';
import { ITableWaiterRepository } from '../domain/repositories/waiter.repository.interface';
import { ITableMapLayoutRepository } from '../domain/repositories/table-map-layout.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { StockReservationService } from '../../orders/domain/services/stock-reservation.service';
import { TableServiceController } from './table-service.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string; user?: { uid: string } };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DELETE ${path}`] = handlers; },
    patch: (path: string, ...handlers: RouteHandler[]) => { routes[`PATCH ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildTable(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1', restaurantId: 'r-1', name: '1', normalizedName: '1', position: { x: 24, y: 24, width: 150, height: 100 }, ...overrides,
  };
}

describe('TableServiceController', () => {
  function setup(overrides: {
    tableRepository?: Partial<IRestaurantTableRepository>;
    waiterRepository?: Partial<ITableWaiterRepository>;
    layoutRepository?: Partial<ITableMapLayoutRepository>;
    orderRepository?: Partial<IOrderRepository>;
    customerRepository?: Partial<ICustomerRepository>;
    productRepository?: Partial<IProductRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    restaurantOperatorRepository?: Partial<IRestaurantOperatorRepository>;
  } = {}) {
    const tableRepository: Partial<IRestaurantTableRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(buildTable()),
      findByNormalizedName: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (restaurantId, input) => buildTable({ restaurantId, ...input })),
      createMany: jest.fn().mockResolvedValue([buildTable()]),
      update: jest.fn().mockImplementation(async (_id, _restaurantId, input) => buildTable(input)),
      deleteIfFree: jest.fn().mockResolvedValue(true),
      claimForOrder: jest.fn().mockResolvedValue(true),
      releaseFromOrder: jest.fn().mockResolvedValue(true),
      updatePosition: jest.fn().mockImplementation(async (_id, _restaurantId, position) => buildTable({ position })),
      ...overrides.tableRepository,
    };
    const waiterRepository: Partial<ITableWaiterRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'w-1', restaurantId: 'r-1', name: 'Ana', isActive: true }),
      update: jest.fn().mockResolvedValue({ id: 'w-1', restaurantId: 'r-1', name: 'Ana', isActive: true }),
      remove: jest.fn().mockResolvedValue(true),
      ...overrides.waiterRepository,
    };
    const layoutRepository: Partial<ITableMapLayoutRepository> = {
      getByRestaurant: jest.fn().mockResolvedValue({ restaurantId: 'r-1', decorations: [] }),
      save: jest.fn().mockImplementation(async (restaurantId, decorations) => ({ restaurantId, decorations })),
      ...overrides.layoutRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findActiveByRestaurant: jest.fn().mockResolvedValue([]),
      findActiveTableOrder: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      updateTableOrder: jest.fn().mockResolvedValue({}),
      addTablePayment: jest.fn().mockResolvedValue({}),
      ...overrides.orderRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue(null),
      upsertProfile: jest.fn().mockResolvedValue({ id: 'table-customer-r-1', name: 'Cliente balcão', email: 'balcao@local' }),
      ...overrides.customerRepository,
    };
    const productRepository = { ...overrides.productRepository } as Partial<IProductRepository>;
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'r-1', stockControlEnabled: false }),
      ...overrides.restaurantRepository,
    };
    const rawMaterialRepository = { findById: jest.fn() } as unknown as IRawMaterialRepository;
    const stockMovementRepository: Partial<IStockMovementRepository> = {
      findByOperationId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    // specs/0137-papeis-garcom-motoboy REQ-7 — `RestaurantOperator` com papel `garcom`, usado
    // pelo seletor de garçom da mesa (substitui o antigo `TableWaiter` nesse ponto específico).
    const restaurantOperatorRepository: Partial<IRestaurantOperatorRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      ...overrides.restaurantOperatorRepository,
    };
    const middleware = jest.fn(async () => {});
    const { application, routes } = buildApp();
    new TableServiceController(
      tableRepository as IRestaurantTableRepository,
      waiterRepository as ITableWaiterRepository,
      layoutRepository as ITableMapLayoutRepository,
      orderRepository as IOrderRepository,
      customerRepository as ICustomerRepository,
      productRepository as IProductRepository,
      restaurantRepository as IRestaurantRepository,
      new StockReservationService(productRepository as IProductRepository, rawMaterialRepository, stockMovementRepository as IStockMovementRepository),
      middleware,
      restaurantOperatorRepository as IRestaurantOperatorRepository,
    ).initializeRoutes(application);
    return { tableRepository, waiterRepository, layoutRepository, orderRepository, customerRepository, productRepository, stockMovementRepository, restaurantOperatorRepository, routes };
  }

  it('AC-1: cria mesa escopada ao restaurante autenticado', async () => {
    const { tableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/tables'], { restaurantId: 'r-1', body: { name: 'Mesa A', capacity: 4 } }, { json, send: jest.fn() });

    expect(tableRepository.create).toHaveBeenCalledWith('r-1', { name: 'Mesa A', capacity: 4 });
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ restaurantId: 'r-1', name: 'Mesa A' }));
  });

  it('AC-2: abre pedido table com cliente anônimo reutilizável e reserva a mesa', async () => {
    const createdOrder = { id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado' };
    const { tableRepository, orderRepository, customerRepository, routes } = setup({
      tableRepository: { findById: jest.fn().mockResolvedValue(buildTable()) },
      orderRepository: { create: jest.fn().mockResolvedValue(createdOrder) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders'],
      { restaurantId: 'r-1', body: { tableId: 't-1' } },
      { json, send: jest.fn() },
    );

    expect(customerRepository.upsertProfile).toHaveBeenCalledWith('table-customer-r-1', expect.objectContaining({ name: 'Cliente balcão' }));
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderType: 'table', tableId: 't-1', tableName: '1', initialStatus: 'confirmado', customerId: 'table-customer-r-1',
    }));
    expect(tableRepository.claimForOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
    expect(json).toHaveBeenCalledWith(201, createdOrder);
  });

  it('AC-3: resolve preço do catálogo e calcula subtotal/serviço no BFF ao incluir item', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', tableName: '1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, serviceChargePercent: 10, serviceChargeAmount: 0,
      coverCharge: 0, tablePayments: [],
    };
    const { orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      },
      productRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', name: 'Pizza', price: 20, isAvailable: true, additionalGroups: [] }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items'],
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [] } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({
      subtotal: 40, serviceChargeAmount: 4, total: 44,
      items: [expect.objectContaining({ productId: 'p-1', unitPrice: 20, quantity: 2 })],
    }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ total: 44 }));
  });

  // Pedido explícito do usuário — motivo do ajuste (ex. "quebrou um copo"), opcional.
  it('aceita e repassa a descrição do ajuste manual (desconto/acréscimo)', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', tableName: '1', status: 'confirmado',
      items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 39 }],
      subtotal: 39, deliveryFee: 0, discount: 0, total: 39, serviceChargePercent: 0, serviceChargeAmount: 0,
      coverCharge: 0, tablePayments: [],
    };
    const { orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/table-orders/:id/adjustments'],
      {
        restaurantId: 'r-1',
        params: { id: 'o-table' },
        body: { adjustment: { type: 'surcharge', mode: 'fixed', value: 5, description: 'quebrou um copo' } },
      },
      { json, send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({
      tableAdjustment: { type: 'surcharge', mode: 'fixed', value: 5, description: 'quebrou um copo' },
    }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      tableAdjustment: expect.objectContaining({ description: 'quebrou um copo' }),
    }));
  });

  it('specs/0108 AC-13: reserva estoque ao incluir item rastreado no POS da mesa', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', tableName: '1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, serviceChargePercent: 0, tablePayments: [],
    };
    const product = { id: 'p-1', restaurantId: 'r-1', name: 'Suco', price: 8, isAvailable: true, tracksStock: true, stockQuantity: 5, additionalGroups: [] };
    const { productRepository, stockMovementRepository, orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', stockControlEnabled: true }) },
      productRepository: {
        findById: jest.fn().mockResolvedValue(product),
        decrementStockIfAvailable: jest.fn().mockResolvedValue(true),
      },
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items'],
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [], operationId: 'pos-add-1' } },
      { json, send: jest.fn() },
    );

    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('p-1', 2);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'o-table', productId: 'p-1', type: 'saida', quantity: 2, operationId: expect.stringContaining('pos-add-1'),
    }));
    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({
      items: [expect.objectContaining({ stockReservations: [expect.objectContaining({ resourceId: 'p-1', quantity: 2 })] })],
    }));
  });

  it('AC-9/AC-22: fecha a conta com pagamentos e libera a mesa', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 30 }],
      subtotal: 30, deliveryFee: 0, discount: 0, total: 30, tablePayments: [],
    };
    const closedOrder = { ...order, status: 'entregue' };
    const { tableRepository, orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        addTablePayment: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockResolvedValue(order),
        updateStatus: jest.fn().mockResolvedValue(closedOrder),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [{ method: 'cash', amount: 12 }, { method: 'pix', amount: 18 }] } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.addTablePayment).toHaveBeenCalledTimes(2);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-table', 'entregue', 'r-1');
    expect(tableRepository.releaseFromOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
    expect(json).toHaveBeenCalledWith(200, closedOrder);
  });

  it('AC-20: bloqueia item que ultrapassaria o limite de consumo', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, serviceChargePercent: 0, tablePayments: [],
    };
    const { orderRepository, routes } = setup({
      layoutRepository: { getByRestaurant: jest.fn().mockResolvedValue({ restaurantId: 'r-1', decorations: [], spendingLimit: 30 }) },
      orderRepository: { findById: jest.fn().mockResolvedValue(order), updateTableOrder: jest.fn() },
      productRepository: { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', name: 'Pizza', price: 20, isAvailable: true, additionalGroups: [] }) },
    });

    await expect(runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items'],
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [] } },
      { json: jest.fn(), send: jest.fn() },
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(orderRepository.updateTableOrder).not.toHaveBeenCalled();
  });

  it('AC-7: resolve preço de opções adicionais aninhadas no catálogo', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, serviceChargePercent: 0, tablePayments: [],
    };
    const product = {
      id: 'p-1', restaurantId: 'r-1', name: 'Pizza', price: 20, isAvailable: true,
      additionalGroups: [{
        name: 'Tamanho', minSelections: 1, maxSelections: 1,
        options: [{ name: 'Grande', priceDelta: 10, nestedAdditionalGroups: [{
          name: 'Borda', minSelections: 1, maxSelections: 1,
          options: [{ name: 'Cheddar', priceDelta: 5 }],
        }] }],
      }],
    };
    const { orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      },
      productRepository: { findById: jest.fn().mockResolvedValue(product) },
    });

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items'],
      {
        restaurantId: 'r-1', params: { id: 'o-table' }, body: {
          productId: 'p-1', quantity: 1,
          selections: [{ groupName: 'Tamanho', optionName: 'Grande', nestedSelections: [{ groupName: 'Borda', optionName: 'Cheddar' }] }],
        },
      },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({
      items: [expect.objectContaining({ unitPrice: 35 })], subtotal: 35, total: 35,
    }));
  });

  it('AC-29: não agrupa itens com observações diferentes', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [
        { id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 20, notes: 'Sem cebola' },
        { id: 'i-2', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 20, notes: 'Com cebola' },
      ],
      subtotal: 40, deliveryFee: 0, discount: 0, total: 40, serviceChargePercent: 0, tablePayments: [],
    };
    const { orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      },
    });

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items/group'],
      { restaurantId: 'r-1', params: { id: 'o-table' } },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({ items: order.items }));
  });

  it('AC-7: cria uma faixa de mesas quando todos os nomes estão livres', async () => {
    const { tableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/tables/range'], { restaurantId: 'r-1', body: { from: 1, to: 3 } }, { json, send: jest.fn() });

    expect(tableRepository.createMany).toHaveBeenCalledWith('r-1', [{ name: '1' }, { name: '2' }, { name: '3' }]);
    expect(json).toHaveBeenCalledWith(201, expect.any(Array));
  });

  it('AC-8: bloqueia excluir mesa ocupada', async () => {
    const { tableRepository, routes } = setup({
      tableRepository: {
        findById: jest.fn().mockResolvedValue(buildTable({ activeOrderId: 'o-1' })),
        deleteIfFree: jest.fn().mockResolvedValue(false),
      },
    });

    await expect(
      runOperatorChain(routes['DELETE /restaurants/me/tables/:id'], { restaurantId: 'r-1', params: { id: 't-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tableRepository.deleteIfFree).toHaveBeenCalledWith('t-1', 'r-1');
  });

  // specs/0137-papeis-garcom-motoboy REQ-7/AC-7.
  it('AC-7 (specs/0137): GET /restaurants/me/table-service/map lista garçons a partir de RestaurantOperator com papel garcom, usando o e-mail como nome', async () => {
    const operators = [
      { id: 'op-1', restaurantId: 'r-1', email: 'ana@exemplo.com', role: 'garcom', isActive: true, createdAt: new Date() },
      { id: 'op-2', restaurantId: 'r-1', email: 'bruno@exemplo.com', role: 'garcom', isActive: false, createdAt: new Date() },
      { id: 'op-3', restaurantId: 'r-1', email: 'dono@exemplo.com', role: 'dono', isActive: true, createdAt: new Date() },
    ];
    const { routes } = setup({
      restaurantOperatorRepository: { listByRestaurant: jest.fn().mockResolvedValue(operators) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/table-service/map'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      waiters: [{ id: 'op-1', restaurantId: 'r-1', name: 'ana@exemplo.com', isActive: true }],
    }));
  });

  it('AC-2/AC-7 (specs/0137): abre pedido de mesa com garçom a partir de RestaurantOperator ativo com papel garcom', async () => {
    const garcomOperator = { id: 'op-1', restaurantId: 'r-1', email: 'ana@exemplo.com', role: 'garcom', isActive: true, createdAt: new Date() };
    const createdOrder = { id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado' };
    const { orderRepository, routes } = setup({
      tableRepository: { findById: jest.fn().mockResolvedValue(buildTable()) },
      orderRepository: { create: jest.fn().mockResolvedValue(createdOrder) },
      restaurantOperatorRepository: { findById: jest.fn().mockResolvedValue(garcomOperator) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders'],
      { restaurantId: 'r-1', body: { tableId: 't-1', waiterId: 'op-1' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      tableWaiter: { id: 'op-1', name: 'ana@exemplo.com' },
    }));
    expect(json).toHaveBeenCalledWith(201, createdOrder);
  });

  it.each([
    ['inativo', { id: 'op-1', restaurantId: 'r-1', email: 'ana@exemplo.com', role: 'garcom', isActive: false, createdAt: new Date() }],
    ['de outro restaurante', { id: 'op-1', restaurantId: 'r-2', email: 'ana@exemplo.com', role: 'garcom', isActive: true, createdAt: new Date() }],
    ['com papel diferente de garcom', { id: 'op-1', restaurantId: 'r-1', email: 'ana@exemplo.com', role: 'gerente', isActive: true, createdAt: new Date() }],
  ])('REQ-7 (specs/0137): rejeita abrir pedido de mesa com operador garçom %s', async (_description, operator) => {
    const { routes } = setup({
      tableRepository: { findById: jest.fn().mockResolvedValue(buildTable()) },
      restaurantOperatorRepository: { findById: jest.fn().mockResolvedValue(operator) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/table-orders'],
        { restaurantId: 'r-1', body: { tableId: 't-1', waiterId: 'op-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
