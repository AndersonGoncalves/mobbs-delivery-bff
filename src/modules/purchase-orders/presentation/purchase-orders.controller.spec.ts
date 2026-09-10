import type { Request, Response, Server } from 'restify';

import { IPurchaseOrderRepository } from '../domain/repositories/purchase-order.repository.interface';
import { IReceivePurchaseOrderService } from '../domain/services/i-receive-purchase-order.service';
import { PurchaseOrdersController } from './purchase-orders.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'>;
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
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    restaurantId: 'r-1',
    supplierId: 'sup-1',
    status: 'aberto',
    items: [
      { rawMaterialId: 'rm-1', quantity: 10, unitCost: 2 },
      { rawMaterialId: 'rm-2', quantity: 5, unitCost: 3 },
    ],
    totalValue: 35,
    createdAt: '2026-09-09T08:00:00.000Z',
    ...overrides,
  };
}

describe('PurchaseOrdersController (specs/0015-estoque-compras REQ-2/REQ-3/REQ-7)', () => {
  function setup(
    overrides: {
      purchaseOrderRepository?: Partial<IPurchaseOrderRepository>;
      receivePurchaseOrderService?: Partial<IReceivePurchaseOrderService>;
    } = {},
  ) {
    const purchaseOrderRepository: Partial<IPurchaseOrderRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildOrder()]),
      create: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.purchaseOrderRepository,
    };
    const receivePurchaseOrderService: Partial<IReceivePurchaseOrderService> = {
      receive: jest.fn().mockResolvedValue(buildOrder({ status: 'recebido', receivedAt: '2026-09-09T09:00:00.000Z' })),
      ...overrides.receivePurchaseOrderService,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new PurchaseOrdersController(
      purchaseOrderRepository as IPurchaseOrderRepository,
      receivePurchaseOrderService as IReceivePurchaseOrderService,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { purchaseOrderRepository, receivePurchaseOrderService, routes };
  }

  it('AC-2: POST /restaurants/me/purchase-orders cria um pedido "Aberto" com o total calculado', async () => {
    const { purchaseOrderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/purchase-orders'],
      {
        restaurantId: 'r-1',
        body: {
          supplierId: 'sup-1',
          items: [
            { rawMaterialId: 'rm-1', quantity: 10, unitCost: 2 },
            { rawMaterialId: 'rm-2', quantity: 5, unitCost: 3 },
          ],
        },
      },
      { json },
    );

    expect(purchaseOrderRepository.create).toHaveBeenCalledWith(
      'r-1',
      'sup-1',
      expect.arrayContaining([expect.objectContaining({ rawMaterialId: 'rm-1', quantity: 10, unitCost: 2 })]),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto', totalValue: 35 }));
  });

  it('rejeita criação sem itens', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/purchase-orders'],
        { restaurantId: 'r-1', body: { supplierId: 'sup-1', items: [] } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-3: PATCH .../receive marca o pedido como recebido delegando pro service', async () => {
    const { receivePurchaseOrderService, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/purchase-orders/:id/receive'],
      { restaurantId: 'r-1', params: { id: 'po-1' } },
      { json },
    );

    expect(receivePurchaseOrderService.receive).toHaveBeenCalledWith('po-1', 'r-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'recebido' }));
  });

  it('AC-7: PATCH .../receive propaga o 409 do service quando já recebido/cancelado', async () => {
    const { routes } = setup({
      receivePurchaseOrderService: {
        receive: jest.fn().mockRejectedValue(Object.assign(new Error('já recebido'), { statusCode: 409 })),
      },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/purchase-orders/:id/receive'],
        { restaurantId: 'r-1', params: { id: 'po-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
