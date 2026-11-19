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
import { FiscalEmissionService } from '../../fiscal-integration/domain/services/fiscal-emission.service';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { TableServiceController } from './table-service.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  restaurantId?: string;
  operatorRole?: Request['operatorRole'];
  user?: { uid: string };
};
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
    fiscalEmissionService?: Partial<FiscalEmissionService>;
    cashRegisterService?: Partial<ICashRegisterService>;
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
      closeTableOrder: jest.fn().mockResolvedValue({}),
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
    // Achado crítico de auditoria (2026-10-31) — "N+1 sequencial por item/adicional":
    // `reserveOrderItems` agora busca matérias-primas/reservas existentes em lote
    // (`findManyByIds`/`findManyByOperationIds`), não mais uma chamada por item/adicional.
    const rawMaterialRepository = { findById: jest.fn(), findManyByIds: jest.fn().mockResolvedValue([]) } as unknown as IRawMaterialRepository;
    const stockMovementRepository: Partial<IStockMovementRepository> = {
      findByOperationId: jest.fn().mockResolvedValue(null),
      findManyByOperationIds: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    };
    // specs/0137-papeis-garcom-motoboy REQ-7 — `RestaurantOperator` com papel `garcom`, usado
    // pelo seletor de garçom da mesa (substitui o antigo `TableWaiter` nesse ponto específico).
    const restaurantOperatorRepository: Partial<IRestaurantOperatorRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      ...overrides.restaurantOperatorRepository,
    };
    // specs/0202-emissao-fiscal-pedidos-mesa — ausente por padrão (undefined), mesmo raciocínio
    // já usado em `OrdersController`: sem o serviço, `closeOrder` nunca tenta emitir nada.
    const fiscalEmissionService: Partial<FiscalEmissionService> | undefined = overrides.fiscalEmissionService
      ? { emitForOrder: jest.fn().mockResolvedValue(undefined), ...overrides.fiscalEmissionService }
      : undefined;
    // specs/0214-estorno-sobrepagamento-mesa — ausente por padrão (undefined), mesmo raciocínio
    // já usado pro `fiscalEmissionService` acima: sem o serviço, nenhum estorno é tentado (os
    // `try*` em `TableOrderService` checam `this.cashRegisterService` antes de chamar).
    const cashRegisterService: Partial<ICashRegisterService> | undefined = overrides.cashRegisterService
      ? {
        addAutomaticEntry: jest.fn().mockResolvedValue(undefined),
        addPartialRefundEntry: jest.fn().mockResolvedValue(undefined),
        ...overrides.cashRegisterService,
      }
      : undefined;
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
      cashRegisterService as ICashRegisterService | undefined,
      fiscalEmissionService as FiscalEmissionService | undefined,
    ).initializeRoutes(application);
    return { tableRepository, waiterRepository, layoutRepository, orderRepository, customerRepository, productRepository, stockMovementRepository, restaurantOperatorRepository, fiscalEmissionService, cashRegisterService, routes };
  }

  it('permite Caixa e Garçom no atendimento, mas restringe o cadastro de mesas a Dono e Gerente', async () => {
    const { routes } = setup();
    const response = { json: jest.fn(), send: jest.fn() };
    const cashierRequest = { operatorRole: 'financeiro' as const };
    const waiterRequest = { operatorRole: 'garcom' as const };

    await expect(
      routes['GET /restaurants/me/table-orders/active'][2](cashierRequest, response),
    ).resolves.toBeUndefined();
    await expect(
      routes['GET /restaurants/me/table-orders/active'][2](waiterRequest, response),
    ).resolves.toBeUndefined();
    await expect(
      routes['POST /restaurants/me/tables'][2](cashierRequest, response),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      routes['POST /restaurants/me/tables'][2](waiterRequest, response),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

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
    // Pedido explícito do usuário — checkbox "Taxa de serviço" começa desmarcada: o pedido nasce
    // com serviceChargePercent 0, não mais 10.
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderType: 'table', tableId: 't-1', tableName: '1', initialStatus: 'confirmado', customerId: 'table-customer-r-1',
      serviceChargePercent: 0,
    }));
    expect(tableRepository.claimForOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
    expect(json).toHaveBeenCalledWith(201, createdOrder);
  });

  // specs/0199-painel-pedidos-por-periodo AC-4.
  it('specs/0199 AC-4: abrir mesa com origin "comanda" grava source "comanda"', async () => {
    const { orderRepository, routes } = setup({
      tableRepository: { findById: jest.fn().mockResolvedValue(buildTable()) },
      orderRepository: { create: jest.fn().mockResolvedValue({ id: 'o-table', restaurantId: 'r-1' }) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders'],
      { restaurantId: 'r-1', body: { tableId: 't-1', origin: 'comanda' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'comanda' }));
  });

  it('specs/0199 AC-4: abrir mesa sem origin (web) grava source ausente', async () => {
    const { orderRepository, routes } = setup({
      tableRepository: { findById: jest.fn().mockResolvedValue(buildTable()) },
      orderRepository: { create: jest.fn().mockResolvedValue({ id: 'o-table', restaurantId: 'r-1' }) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders'],
      { restaurantId: 'r-1', body: { tableId: 't-1', origin: 'web' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ source: undefined }));
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
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [], operationId: 'pos-add-1' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({
      subtotal: 40, serviceChargeAmount: 4, total: 44,
      items: [expect.objectContaining({ productId: 'p-1', unitPrice: 20, quantity: 2 })],
    }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ total: 44 }));
  });

  // Achado crítico da auditoria pré-produção (31/10/2026) — "sem idempotência real — nem no
  // app, nem no servidor": um retry com a MESMA operationId (rede caiu depois do pedido já ter
  // sido incluído, o app do garçom reenvia) nunca pode duplicar a linha.
  it('achado de auditoria (2026-10-31): reenviar a MESMA operationId não duplica o item, devolve o pedido já atualizado', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', tableName: '1', status: 'confirmado',
      items: [{ id: 'pos-add-1', productId: 'p-1', productName: 'Pizza', quantity: 2, unitPrice: 20 }],
      subtotal: 40, deliveryFee: 0, discount: 0, total: 44, serviceChargePercent: 10, serviceChargeAmount: 4,
      coverCharge: 0, tablePayments: [],
    };
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(order), updateTableOrder: jest.fn() },
      productRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', name: 'Pizza', price: 20, isAvailable: true, additionalGroups: [] }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/items'],
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [], operationId: 'pos-add-1' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.updateTableOrder).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ items: order.items, total: 44 }));
  });

  it('rejeita (400) a requisição sem operationId, sem incluir o item', async () => {
    const { orderRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/table-orders/:id/items'],
        { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [] } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateTableOrder).not.toHaveBeenCalled();
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
        findManyByIds: jest.fn().mockResolvedValue([product]),
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
    const closedOrder = { ...order, status: 'entregue', tableCloseClientRequestId: 'req-1' };
    const { tableRepository, orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        closeTableOrder: jest.fn().mockResolvedValue(closedOrder),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      {
        restaurantId: 'r-1',
        user: { uid: 'operator-1' },
        params: { id: 'o-table' },
        body: { payments: [{ method: 'cash', amount: 12 }, { method: 'pix', amount: 18 }], clientRequestId: 'req-1' },
      },
      { json, send: jest.fn() },
    );

    // Achado crítico da auditoria pré-produção (31/10/2026) — idempotência: pagamentos +
    // fechamento numa ÚNICA escrita atômica (`closeTableOrder`), nunca mais a sequência de
    // addTablePayment/updateTableOrder/updateStatus separados; ids derivados da
    // `clientRequestId` (nunca `randomUUID()`).
    expect(orderRepository.closeTableOrder).toHaveBeenCalledWith('o-table', 'r-1', {
      payments: [
        { id: 'req-1:0', method: 'cash', amount: 12, paidAt: expect.any(String), paidBy: 'operator-1' },
        { id: 'req-1:1', method: 'pix', amount: 18, paidAt: expect.any(String), paidBy: 'operator-1' },
      ],
      closedAt: expect.any(String),
      clientRequestId: 'req-1',
      changedBy: 'operator-1',
    });
    expect(tableRepository.releaseFromOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
    expect(json).toHaveBeenCalledWith(200, closedOrder);
  });

  // specs/0202-emissao-fiscal-pedidos-mesa AC-1/AC-2 — mesmo gatilho fiscal que já existe pra
  // delivery/retirada (specs/0091), agora também no fechamento de mesa/balcão.
  it('AC-1 (0202): fechar a conta dispara a emissão fiscal com o pedido fechado, quando o serviço está presente', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 30 }],
      subtotal: 30, deliveryFee: 0, discount: 0, total: 30, tablePayments: [],
    };
    const closedOrder = { ...order, status: 'entregue', tableCloseClientRequestId: 'req-3' };
    const { fiscalEmissionService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        closeTableOrder: jest.fn().mockResolvedValue(closedOrder),
      },
      fiscalEmissionService: {},
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      {
        restaurantId: 'r-1',
        user: { uid: 'operator-1' },
        params: { id: 'o-table' },
        body: { payments: [{ method: 'cash', amount: 30 }], clientRequestId: 'req-3' },
      },
      { json, send: jest.fn() },
    );

    expect(fiscalEmissionService!.emitForOrder).toHaveBeenCalledWith(closedOrder);
  });

  // specs/0202-emissao-fiscal-pedidos-mesa AC-2 — sem o serviço (restaurante sem integração
  // fiscal em lugar nenhum do sistema), fechar a conta continua funcionando normalmente, sem
  // erro nenhum visível ao operador (todos os outros testes deste describe já cobrem isso
  // implicitamente, por nunca passarem `fiscalEmissionService`; este deixa explícito).
  it('AC-2 (0202): fechar a conta funciona normalmente sem o serviço fiscal (restaurante sem integração)', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 30 }],
      subtotal: 30, deliveryFee: 0, discount: 0, total: 30, tablePayments: [],
    };
    const closedOrder = { ...order, status: 'entregue', tableCloseClientRequestId: 'req-4' };
    const { routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        closeTableOrder: jest.fn().mockResolvedValue(closedOrder),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      {
        restaurantId: 'r-1',
        user: { uid: 'operator-1' },
        params: { id: 'o-table' },
        body: { payments: [{ method: 'cash', amount: 30 }], clientRequestId: 'req-4' },
      },
      { json, send: jest.fn() },
    );

    expect(json).toHaveBeenCalledWith(200, closedOrder);
  });

  // specs/0202-emissao-fiscal-pedidos-mesa AC-3 — pedido já cancelado continua sendo rejeitado
  // antes de chegar a qualquer lógica fiscal (comportamento já existente; só confirma que a
  // adição do gatilho fiscal não mudou essa regra).
  it('AC-3 (0202): pedido de mesa já cancelado é rejeitado ao tentar fechar, sem tentar emitir nota', async () => {
    const cancelledOrder = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'cancelado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [],
    };
    const { fiscalEmissionService, orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(cancelledOrder) },
      fiscalEmissionService: {},
    });
    const json = jest.fn();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/table-orders/:id/close'],
        {
          restaurantId: 'r-1',
          user: { uid: 'operator-1' },
          params: { id: 'o-table' },
          body: { payments: [], clientRequestId: 'req-5' },
        },
        { json, send: jest.fn() },
      ),
    ).rejects.toThrow('Pedido de mesa aberto não encontrado');

    expect(orderRepository.closeTableOrder).not.toHaveBeenCalled();
    expect(fiscalEmissionService!.emitForOrder).not.toHaveBeenCalled();
  });

  // specs/0214-estorno-sobrepagamento-mesa AC-1/AC-2/AC-4 — remover item que deixaria saldo
  // sobre-pago exige confirmação; confirmado, aplica e estorna; sem excedente, segue normal.
  describe('specs/0214-estorno-sobrepagamento-mesa — sobre-pagamento ao reduzir item/ajuste', () => {
    function buildPaidOrder(overrides: Record<string, unknown> = {}) {
      return {
        id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
        items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 10 }],
        subtotal: 10, deliveryFee: 0, discount: 0, total: 10, orderNumber: 72, paymentMethod: 'cash',
        tablePayments: [{ id: 'pay-1', method: 'cash', amount: 10, paidAt: '2026-11-11T00:00:00.000Z', paidBy: 'op-1' }],
        ...overrides,
      };
    }

    it('AC-1: remover item que deixaria saldo pago maior que o novo total responde 409 sem aplicar', async () => {
      const order = buildPaidOrder();
      const { orderRepository, cashRegisterService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(order) },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/items/:itemId/quantity'],
        { restaurantId: 'r-1', params: { id: 'o-table', itemId: 'i-1' }, body: { quantity: 0, operationId: 'op-remove-1' } },
        { json, send: jest.fn() },
      );

      expect(json).toHaveBeenCalledWith(409, { requiresConfirmation: true, alreadyPaid: 10, newTotal: 0, excess: 10 });
      expect(orderRepository.updateTableOrder).not.toHaveBeenCalled();
      expect(cashRegisterService!.addPartialRefundEntry).not.toHaveBeenCalled();
    });

    it('AC-2: confirmado, remove o item e lança o estorno do excedente no caixa', async () => {
      const order = buildPaidOrder();
      const { orderRepository, cashRegisterService, routes } = setup({
        orderRepository: {
          findById: jest.fn().mockResolvedValue(order),
          updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
        },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/items/:itemId/quantity'],
        { restaurantId: 'r-1', params: { id: 'o-table', itemId: 'i-1' }, body: { quantity: 0, operationId: 'op-remove-1', confirmed: true } },
        { json, send: jest.fn() },
      );

      expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({ items: [], total: 0 }));
      expect(cashRegisterService!.addPartialRefundEntry).toHaveBeenCalledWith(expect.objectContaining({
        restaurantId: 'r-1', orderId: 'o-table', orderNumber: 72, amount: 10, paymentMethod: 'cash',
      }));
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ total: 0 }));
    });

    it('AC-4: reduzir sem deixar excedente (saldo pago ainda cabe no novo total) segue normal, sem 409 nem estorno', async () => {
      const order = buildPaidOrder({
        items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 2, unitPrice: 10 }],
        subtotal: 20, total: 20,
        tablePayments: [{ id: 'pay-1', method: 'cash', amount: 5, paidAt: '2026-11-11T00:00:00.000Z', paidBy: 'op-1' }],
      });
      const { orderRepository, cashRegisterService, routes } = setup({
        orderRepository: {
          findById: jest.fn().mockResolvedValue(order),
          updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
        },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/items/:itemId/quantity'],
        { restaurantId: 'r-1', params: { id: 'o-table', itemId: 'i-1' }, body: { quantity: 1, operationId: 'op-remove-1' } },
        { json, send: jest.fn() },
      );

      expect(orderRepository.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({ total: 10 }));
      expect(cashRegisterService!.addPartialRefundEntry).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ total: 10 }));
    });

    // AC-5 — mesmo comportamento do AC-1/AC-2, agora via `updateAdjustments` (desconto).
    it('AC-5: aplicar desconto que deixaria saldo sobre-pago responde 409; confirmado, aplica e estorna', async () => {
      const order = buildPaidOrder();
      const { orderRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(order) },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/adjustments'],
        { restaurantId: 'r-1', params: { id: 'o-table' }, body: { adjustment: { type: 'discount', mode: 'fixed', value: 5 } } },
        { json, send: jest.fn() },
      );

      expect(json).toHaveBeenCalledWith(409, { requiresConfirmation: true, alreadyPaid: 10, newTotal: 5, excess: 5 });
      expect(orderRepository.updateTableOrder).not.toHaveBeenCalled();

      const json2 = jest.fn();
      const orderRepository2 = {
        findById: jest.fn().mockResolvedValue(order),
        updateTableOrder: jest.fn().mockImplementation(async (_id, _restaurantId, patch) => ({ ...order, ...patch })),
      };
      const { cashRegisterService: cashRegisterService2, routes: routes2 } = setup({ orderRepository: orderRepository2, cashRegisterService: {} });
      await runOperatorChain(
        routes2['PATCH /restaurants/me/table-orders/:id/adjustments'],
        { restaurantId: 'r-1', params: { id: 'o-table' }, body: { adjustment: { type: 'discount', mode: 'fixed', value: 5 }, confirmed: true } },
        { json: json2, send: jest.fn() },
      );

      expect(orderRepository2.updateTableOrder).toHaveBeenCalledWith('o-table', 'r-1', expect.objectContaining({ total: 5 }));
      expect(cashRegisterService2!.addPartialRefundEntry).toHaveBeenCalledWith(expect.objectContaining({ amount: 5, orderId: 'o-table' }));
      expect(json2).toHaveBeenCalledWith(200, expect.objectContaining({ total: 5 }));
    });
  });

  // specs/0214-estorno-sobrepagamento-mesa AC-6/AC-7/AC-8/AC-9 — cancelar atendimento de mesa.
  describe('specs/0214-estorno-sobrepagamento-mesa — cancelar atendimento', () => {
    it('AC-9: um papel diferente de dono/gerente (ex. garçom) recebe 403 ao tentar cancelar', async () => {
      const { routes } = setup();
      const response = { json: jest.fn(), send: jest.fn() };

      await expect(
        routes['PATCH /restaurants/me/table-orders/:id/cancel'][2]({ operatorRole: 'garcom' as const }, response),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        routes['PATCH /restaurants/me/table-orders/:id/cancel'][2]({ operatorRole: 'financeiro' as const }, response),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-7: cancela mesa sem pagamento — vira cancelado e libera a mesa', async () => {
      const order = {
        id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
        items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 10 }],
        subtotal: 10, deliveryFee: 0, discount: 0, total: 10, orderNumber: 72, paymentMethod: 'cash', tablePayments: [],
      };
      const cancelledOrder = { ...order, status: 'cancelado' };
      const { tableRepository, orderRepository, cashRegisterService, routes } = setup({
        orderRepository: {
          findById: jest.fn().mockResolvedValue(order),
          updateStatus: jest.fn().mockResolvedValue(cancelledOrder),
        },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/cancel'],
        { restaurantId: 'r-1', user: { uid: 'op-dono' }, params: { id: 'o-table' }, body: { reason: 'Mesa esquecida aberta' } },
        { json, send: jest.fn() },
      );

      expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-table', 'cancelado', 'op-dono', 'Mesa esquecida aberta');
      expect(tableRepository.releaseFromOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
      expect(cashRegisterService!.addPartialRefundEntry).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, cancelledOrder);
    });

    it('AC-8: cancela mesa com pagamento parcial em dinheiro já registrado — estorna no caixa', async () => {
      const order = {
        id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
        items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 20 }],
        subtotal: 20, deliveryFee: 0, discount: 0, total: 20, orderNumber: 72, paymentMethod: 'cash',
        tablePayments: [{ id: 'pay-1', method: 'cash', amount: 15, paidAt: '2026-11-11T00:00:00.000Z', paidBy: 'op-1' }],
      };
      const cancelledOrder = { ...order, status: 'cancelado' };
      const { cashRegisterService, routes } = setup({
        orderRepository: {
          findById: jest.fn().mockResolvedValue(order),
          updateStatus: jest.fn().mockResolvedValue(cancelledOrder),
        },
        cashRegisterService: {},
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/table-orders/:id/cancel'],
        { restaurantId: 'r-1', user: { uid: 'op-dono' }, params: { id: 'o-table' }, body: { reason: 'Cliente desistiu' } },
        { json, send: jest.fn() },
      );

      expect(cashRegisterService!.addPartialRefundEntry).toHaveBeenCalledWith(expect.objectContaining({
        restaurantId: 'r-1', orderId: 'o-table', orderNumber: 72, amount: 15, paymentMethod: 'cash', paymentId: 'pay-1',
      }));
      expect(json).toHaveBeenCalledWith(200, cancelledOrder);
    });

    it('rejeita (400) sem motivo', async () => {
      const order = {
        id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
        items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [],
      };
      const { orderRepository, routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(order) } });

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/table-orders/:id/cancel'],
          { restaurantId: 'r-1', user: { uid: 'op-dono' }, params: { id: 'o-table' }, body: {} },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // specs/0202-emissao-fiscal-pedidos-mesa AC-4 — pedido de Balcão (orderType: 'table', sem
  // tableId, criado pelo PDV via operator-drafts) fecha pelo mesmíssimo closeOrder de uma mesa, e
  // dispara a emissão fiscal do mesmo jeito.
  it('AC-4 (0202): fechar um pedido de Balcão (orderType table, sem tableId) também dispara a emissão fiscal', async () => {
    const order = {
      id: 'o-counter', restaurantId: 'r-1', orderType: 'table', status: 'confirmado',
      items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 30 }],
      subtotal: 30, deliveryFee: 0, discount: 0, total: 30, tablePayments: [],
    };
    const closedOrder = { ...order, status: 'entregue', tableCloseClientRequestId: 'req-6' };
    const { tableRepository, fiscalEmissionService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        closeTableOrder: jest.fn().mockResolvedValue(closedOrder),
      },
      fiscalEmissionService: {},
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      {
        restaurantId: 'r-1',
        user: { uid: 'operator-1' },
        params: { id: 'o-counter' },
        body: { payments: [{ method: 'cash', amount: 30 }], clientRequestId: 'req-6' },
      },
      { json, send: jest.fn() },
    );

    // Sem tableId, nunca chama releaseFromOrder (não tem mesa pra liberar) — confirma que o
    // caminho de balcão passa por aqui sem precisar de mesa vinculada.
    expect(tableRepository.releaseFromOrder).not.toHaveBeenCalled();
    expect(fiscalEmissionService!.emitForOrder).toHaveBeenCalledWith(closedOrder);
  });

  // Pedido explícito do usuário (17/11/2026) — ver `isAutoPrintMissed`: mesa fechada há mais tempo
  // que `autoPrintMaxAgeMinutes` sem a comanda impressa, pro operador saber na tela "Fechados".
  it('GET /restaurants/me/table-orders/history inclui autoPrintMissed/fiscalPrintMissed por pedido', async () => {
    const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
    const recent = new Date(Date.now() - 1 * 60_000).toISOString();
    const orders = [
      { id: 'o-missed', restaurantId: 'r-1', orderType: 'table', status: 'entregue', tableClosedAt: tooOld },
      { id: 'o-fresh', restaurantId: 'r-1', orderType: 'table', status: 'entregue', tableClosedAt: recent },
      { id: 'o-printed', restaurantId: 'r-1', orderType: 'table', status: 'entregue', tableClosedAt: tooOld, autoPrintStatus: 'printed' },
    ];
    const { routes } = setup({
      orderRepository: { findClosedTableOrders: jest.fn().mockResolvedValue(orders) },
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', autoPrintMaxAgeMinutes: 5 }) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/table-orders/history'],
      { restaurantId: 'r-1', query: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-18T00:00:00.000Z' } },
      { json, send: jest.fn() },
    );

    expect(json).toHaveBeenCalledWith(200, [
      expect.objectContaining({ id: 'o-missed', autoPrintMissed: true }),
      expect.objectContaining({ id: 'o-fresh', autoPrintMissed: false }),
      expect.objectContaining({ id: 'o-printed', autoPrintMissed: false }),
    ]);
  });

  it('GET /restaurants/me/table-orders/:id inclui autoPrintMissed/fiscalPrintMissed do pedido', async () => {
    const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
    const order = { id: 'o-table', restaurantId: 'r-1', orderType: 'table', status: 'entregue', tableClosedAt: tooOld };
    const { routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(order) },
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', autoPrintMaxAgeMinutes: 5 }) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/table-orders/:id'],
      { restaurantId: 'r-1', params: { id: 'o-table' } },
      { json, send: jest.fn() },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'o-table', autoPrintMissed: true }));
  });

  // Pedido explícito do usuário — mesa aberta por engano/teste, sem nenhum item, precisa fechar
  // sem exigir pagamento (saldo já é zero).
  it('fecha a conta de uma mesa sem itens, sem exigir pagamento', async () => {
    const order = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [],
    };
    const closedOrder = { ...order, status: 'entregue', tableCloseClientRequestId: 'req-2' };
    const { tableRepository, orderRepository, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(order),
        closeTableOrder: jest.fn().mockResolvedValue(closedOrder),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [], clientRequestId: 'req-2' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.closeTableOrder).toHaveBeenCalledWith('o-table', 'r-1', {
      payments: [],
      closedAt: expect.any(String),
      clientRequestId: 'req-2',
      changedBy: 'operator-1',
    });
    expect(tableRepository.releaseFromOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-table');
    expect(json).toHaveBeenCalledWith(200, closedOrder);
  });

  // Achado crítico da auditoria pré-produção (31/10/2026) — "fechar comanda ... vale desenhar a
  // idempotência certa desde o início, não repetir o mesmo problema do lançamento de item".
  it('achado de auditoria (2026-10-31): retry com a MESMA clientRequestId num pedido já fechado devolve o mesmo pedido, sem tentar fechar de novo', async () => {
    const closedOrder = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'entregue',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [], tableCloseClientRequestId: 'req-1',
    };
    const { tableRepository, orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(closedOrder) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [], clientRequestId: 'req-1' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.closeTableOrder).not.toHaveBeenCalled();
    expect(tableRepository.releaseFromOrder).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, closedOrder);
  });

  it('achado de auditoria (2026-10-31): clientRequestId DIFERENTE numa mesa já fechada é conflito real (404), não idempotência', async () => {
    const closedOrder = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'entregue',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [], tableCloseClientRequestId: 'req-de-outra-tentativa',
    };
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(closedOrder) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/table-orders/:id/close'],
        { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [], clientRequestId: 'req-nova' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.closeTableOrder).not.toHaveBeenCalled();
  });

  it('achado de auditoria (2026-10-31): closeTableOrder perde a corrida pra um retry com a MESMA clientRequestId — ainda devolve o pedido fechado (idempotente)', async () => {
    const openOrder = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [],
    };
    const closedByWinner = { ...openOrder, status: 'entregue', tableCloseClientRequestId: 'req-1' };
    const findById = jest.fn()
      .mockResolvedValueOnce(openOrder) // 1ª leitura: ainda aberto
      .mockResolvedValueOnce(closedByWinner); // 2ª leitura (depois de perder a corrida): já fechado pela MESMA clientRequestId
    const { orderRepository, routes } = setup({
      orderRepository: { findById, closeTableOrder: jest.fn().mockResolvedValue(null) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/table-orders/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [], clientRequestId: 'req-1' } },
      { json, send: jest.fn() },
    );

    expect(json).toHaveBeenCalledWith(200, closedByWinner);
  });

  it('achado de auditoria (2026-10-31): closeTableOrder perde a corrida pra um fechamento concorrente de OUTRO operador — conflito real (409)', async () => {
    const openOrder = {
      id: 'o-table', restaurantId: 'r-1', orderType: 'table', tableId: 't-1', status: 'confirmado',
      items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0, tablePayments: [],
    };
    const closedByOtherOperator = { ...openOrder, status: 'entregue', tableCloseClientRequestId: 'req-de-outro-operador' };
    const findById = jest.fn().mockResolvedValueOnce(openOrder).mockResolvedValueOnce(closedByOtherOperator);
    const { orderRepository, routes } = setup({
      orderRepository: { findById, closeTableOrder: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/table-orders/:id/close'],
        { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'o-table' }, body: { payments: [], clientRequestId: 'req-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
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
      { restaurantId: 'r-1', params: { id: 'o-table' }, body: { productId: 'p-1', quantity: 2, selections: [], operationId: 'pos-add-2' } },
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
          operationId: 'pos-add-3',
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

  // Pedido explícito do usuário — dias com música ao vivo, usados pra condicionar o checkbox
  // "Couvert" na tela de atendimento (web).
  it('PUT /restaurants/me/table-map/layout: repassa liveMusicDays pro repositório', async () => {
    const { layoutRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/table-map/layout'],
      { restaurantId: 'r-1', body: { decorations: [], liveMusicDays: ['friday', 'saturday'] } },
      { json, send: jest.fn() },
    );

    expect(layoutRepository.save).toHaveBeenCalledWith('r-1', [], undefined, undefined, ['friday', 'saturday']);
    expect(json).toHaveBeenCalledWith(200, expect.anything());
  });
});
