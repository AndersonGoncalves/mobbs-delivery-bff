import type { Request, Response, Server } from 'restify';

import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { OrdersController } from './orders.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  user?: { uid: string; email?: string };
  restaurantId?: string;
};
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware (primeiro da chain) — tem spec própria — e injeta `req.user`
// manualmente, como o middleware real faria.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// GET /orders/track/:token não tem firebaseAuthMiddleware (rota pública, REQ-8) — roda todos os
// handlers, sem pular o primeiro.
async function runPublicChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

// Rotas /restaurants/me/... (specs/0008-acompanhamento-vendas) passam por
// firebaseAuthMiddleware + restaurantOperatorMiddleware — pula os dois (cada um tem spec
// própria) e injeta `req.restaurantId` manualmente, como o middleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<{ isActive: boolean; deliveryFeeCents: number }> = {}) {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    deliveryFeeCents: 5,
    ...overrides,
  };
}

function buildItem(overrides: Partial<{ unitPrice: number; quantity: number }> = {}) {
  return {
    id: 'i-1',
    productId: 'p-1',
    productName: 'Pizza',
    quantity: 1,
    unitPrice: 25,
    selections: [],
    ...overrides,
  };
}

function buildValidBody(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    paymentMethod: 'cash',
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    trackingToken: 'token-1',
    customerId: 'customer-1',
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    status: 'aguardandoConfirmacao',
    statusHistory: [{ status: 'aguardandoConfirmacao', changedAt: new Date().toISOString() }],
    subtotal: 25,
    deliveryFee: 5,
    discount: 0,
    total: 30,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('OrdersController', () => {
  function setup(overrides: { orderRepository?: Partial<IOrderRepository>; restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'o-1',
        orderNumber: 1,
        trackingToken: 'token-1',
        status: 'aguardandoConfirmacao',
        statusHistory: [],
        createdAt: new Date().toISOString(),
        ...input,
      })),
      findManyByCustomer: jest.fn().mockResolvedValue([buildOrder()]),
      findById: jest.fn().mockResolvedValue(buildOrder()),
      findByTrackingToken: jest.fn().mockResolvedValue(buildOrder()),
      findActiveByRestaurant: jest.fn().mockResolvedValue([buildOrder()]),
      updateStatus: jest.fn().mockImplementation(async (id, status, changedBy, reason) => ({
        ...buildOrder(),
        status,
        statusHistory: [
          ...buildOrder().statusHistory,
          { status, changedAt: new Date().toISOString(), changedBy, reason },
        ],
      })),
      getSalesSummary: jest.fn().mockResolvedValue({
        restaurantId: 'r-1',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-30T23:59:59.999Z',
        totalOrders: 10,
        totalRevenue: 300,
        cancelledOrders: 1,
      }),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const restaurantOperatorMiddleware = jest.fn();
    const whatsAppNotificationService: IWhatsAppNotificationService = {
      sendOrderReceipt: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const cashRegisterService: ICashRegisterService = {
      addAutomaticEntry: jest.fn().mockResolvedValue(undefined),
    };
    const { application, routes } = buildFakeApplication();
    new OrdersController(
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      restaurantOperatorMiddleware,
      whatsAppNotificationService,
      cashRegisterService,
    ).initializeRoutes(application);
    return { orderRepository, restaurantRepository, whatsAppNotificationService, cashRegisterService, routes };
  }

  it('AC-2: POST /orders cria o pedido com subtotal/taxa/total calculados no BFF (não confia no cliente)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ items: [buildItem({ unitPrice: 25, quantity: 2 })] }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1', subtotal: 50, deliveryFee: 5, discount: 0, total: 55 }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1', orderNumber: 1 }));
  });

  it('specs/0013 REQ-1: POST /orders dispara o recibo por WhatsApp (fire-and-forget) após criar o pedido', async () => {
    const { whatsAppNotificationService, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody(), user: { uid: 'customer-1' } },
      { json: jest.fn() },
    );
    // fire-and-forget: dá um tick pra Promise não aguardada resolver antes de checar a chamada.
    await Promise.resolve();

    expect(whatsAppNotificationService.sendOrderReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o-1' }),
      undefined,
    );
  });

  it('specs/0013 REQ-4: falha no envio do recibo não impede a resposta 201 de POST /orders', async () => {
    const { whatsAppNotificationService, routes } = setup();
    (whatsAppNotificationService.sendOrderReceipt as jest.Mock).mockRejectedValue(new Error('sessão caiu'));
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody(), user: { uid: 'customer-1' } },
      { json },
    );
    await Promise.resolve();

    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1' }));
  });

  it('Retirada (pickup): taxa de entrega é zero mesmo com Restaurant.deliveryFeeCents > 0', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ orderType: 'pickup', deliveryAddress: undefined }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryFee: 0, total: 25 }));
  });

  it('rejeita Delivery sem deliveryAddress', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ deliveryAddress: undefined }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita Cartão de Crédito sem cardBrand', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'creditCard' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita Cartão de Crédito com cardBrand informado', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ paymentMethod: 'creditCard', cardBrand: 'Visa' }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cardBrand: 'Visa' }));
  });

  it('lança 404 quando o restaurante não existe', async () => {
    const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /orders lista os pedidos do próprio cliente', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders'], { user: { uid: 'customer-1' } }, { json });

    expect(orderRepository.findManyByCustomer).toHaveBeenCalledWith('customer-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-1' })]);
  });

  it('AC-2: GET /orders/:id retorna o detalhe de um pedido do próprio cliente', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'o-1' }));
  });

  it('GET /orders/:id lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['GET /orders/:id'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-6: PATCH /orders/:id/cancel cancela um pedido aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PATCH /orders/:id/cancel'],
      { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'cancelado', 'customer-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'cancelado' }));
  });

  it('AC-6: PATCH /orders/:id/cancel rejeita quando o pedido não está mais aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'confirmado' })) },
    });

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /orders/:id/cancel lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-8: GET /orders/track/:token é público e devolve só o necessário pra tela', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'token-1' } }, { json });

    expect(orderRepository.findByTrackingToken).toHaveBeenCalledWith('token-1');
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ orderNumber: 1, status: 'aguardandoConfirmacao' });
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('restaurantId');
    expect(payload).not.toHaveProperty('deliveryAddress');
  });

  it('GET /orders/track/:token lança 404 quando o token não existe', async () => {
    const { routes } = setup({ orderRepository: { findByTrackingToken: jest.fn().mockResolvedValue(null) } });

    await expect(
      runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /restaurants/me/orders lista os pedidos em andamento do restaurante do operador (token, não da rota)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/orders'], { restaurantId: 'r-1' }, { json });

    expect(orderRepository.findActiveByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-1' })]);
  });

  it('AC-2: PATCH /restaurants/me/orders/:id/status avança um passo (aguardandoConfirmacao -> confirmado)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'confirmado', 'r-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'confirmado' }));
  });

  it('specs/0013 REQ-2: PATCH .../status dispara o aviso de mudança de status por WhatsApp', async () => {
    const { whatsAppNotificationService, routes } = setup();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json: jest.fn() },
    );
    await Promise.resolve();

    expect(whatsAppNotificationService.sendOrderStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmado' }),
    );
  });

  it('specs/0014-financeiro REQ-5: PATCH .../status pra "entregue" chama CashRegisterService com os dados do pedido', async () => {
    const { cashRegisterService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega', paymentMethod: 'pix' })),
        updateStatus: jest.fn().mockResolvedValue(buildOrder({ status: 'entregue', paymentMethod: 'pix' })),
      },
    });

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
      { json: jest.fn() },
    );

    expect(cashRegisterService.addAutomaticEntry).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      orderId: 'o-1',
      orderNumber: 1,
      amount: 30,
      paymentMethod: 'pix',
    });
  });

  it('specs/0014-financeiro REQ-5: PATCH .../status pra um status que não é "entregue" nunca chama CashRegisterService', async () => {
    const { cashRegisterService, routes } = setup();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json: jest.fn() },
    );

    expect(cashRegisterService.addAutomaticEntry).not.toHaveBeenCalled();
  });

  it('specs/0014-financeiro REQ-5: falha no lançamento automático de caixa não impede a resposta 200 da mudança de status', async () => {
    const { cashRegisterService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega' })),
      },
    });
    (cashRegisterService.addAutomaticEntry as jest.Mock).mockRejectedValue(new Error('sessão de caixa indisponível'));
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'entregue' }));
  });

  it('AC-5: PATCH /restaurants/me/orders/:id/status bloqueia pular de aguardandoConfirmacao direto pra entregue', async () => {
    const { orderRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /restaurants/me/orders/:id/status lança 404 quando o pedido é de outro restaurante', async () => {
    const { routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-3: PATCH /restaurants/me/orders/:id/cancel exige motivo e registra na linha do tempo', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/cancel'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { reason: 'Cliente desistiu' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'cancelado', 'r-1', 'Cliente desistiu');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'cancelado' }));
  });

  it('PATCH /restaurants/me/orders/:id/cancel rejeita corpo sem motivo', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/cancel'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: {} },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('PATCH /restaurants/me/orders/:id/cancel rejeita quando o pedido já saiu para entrega', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/cancel'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { reason: 'Cliente desistiu' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('AC-4: GET /restaurants/me/sales-summary devolve o agregado do período, escopado ao restaurante do operador', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/sales-summary'],
      { restaurantId: 'r-1', query: { from: '2026-09-01', to: '2026-09-30' } },
      { json },
    );

    expect(orderRepository.getSalesSummary).toHaveBeenCalledWith('r-1', new Date('2026-09-01'), new Date('2026-09-30'));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ totalOrders: 10, totalRevenue: 300, cancelledOrders: 1 }));
  });

  it('GET /restaurants/me/sales-summary rejeita datas inválidas', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/sales-summary'],
        { restaurantId: 'r-1', query: { from: 'não-é-uma-data', to: '2026-09-30' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
