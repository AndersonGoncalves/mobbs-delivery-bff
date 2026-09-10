import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICoupon } from '../domain/entities/coupon.entity';
import { ICouponRepository } from '../domain/repositories/coupon.repository.interface';
import { CouponsController } from './coupons.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & {
  user?: { uid: string; email?: string };
  restaurantId?: string;
};
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
    put: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PUT ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// `/restaurants/me/coupons*` passa por firebaseAuthMiddleware + restaurantOperatorMiddleware
// (mesmo padrão de orders.controller.spec.ts) — pula os dois e injeta `req.restaurantId`.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

// `/restaurants/:id/coupons/validate` só passa por firebaseAuthMiddleware (cliente, não operador).
async function runCustomerChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildCoupon(overrides: Partial<ICoupon> = {}): ICoupon {
  return {
    id: 'c-1',
    restaurantId: 'r-1',
    code: 'PROMO10',
    discountType: 'percentual',
    discountValue: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    usageCount: 0,
    isActive: true,
    ...overrides,
  };
}

function buildSaveBody(overrides: Record<string, unknown> = {}) {
  return {
    code: 'promo10',
    discountType: 'percentual',
    discountValue: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CouponsController (specs/0022-cupons-desconto)', () => {
  function setup(
    overrides: {
      couponRepository?: Partial<ICouponRepository>;
      orderRepository?: Partial<IOrderRepository>;
    } = {},
  ) {
    const couponRepository: Partial<ICouponRepository> = {
      findManyByRestaurant: jest.fn().mockResolvedValue([buildCoupon()]),
      findById: jest.fn().mockResolvedValue(buildCoupon()),
      findByCode: jest.fn().mockResolvedValue(buildCoupon()),
      create: jest.fn().mockImplementation(async (restaurantId, input) => buildCoupon({ restaurantId, ...input, usageCount: 0 })),
      update: jest.fn().mockImplementation(async (id, input) => buildCoupon({ id, ...input })),
      ...overrides.couponRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      countByCustomerAndCoupon: jest.fn().mockResolvedValue(0),
      ...overrides.orderRepository,
    };
    const restaurantOperatorMiddleware = jest.fn();
    const { application, routes } = buildFakeApplication();
    new CouponsController(
      couponRepository as ICouponRepository,
      orderRepository as IOrderRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { couponRepository, orderRepository, routes };
  }

  it('AC-1: POST /restaurants/me/coupons cria o cupom com o código normalizado (maiúsculo)', async () => {
    const { couponRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/coupons'],
      { restaurantId: 'r-1', body: buildSaveBody({ code: 'promo10' }) },
      { json },
    );

    expect(couponRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ code: 'PROMO10' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ code: 'PROMO10' }));
  });

  it('AC-1/AC-5: GET /restaurants/me/coupons lista os cupons do restaurante do operador com usageCount atual', async () => {
    const { couponRepository, routes } = setup({
      couponRepository: { findManyByRestaurant: jest.fn().mockResolvedValue([buildCoupon({ usageCount: 3 })]) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/coupons'], { restaurantId: 'r-1' }, { json });

    expect(couponRepository.findManyByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ usageCount: 3 })]);
  });

  it('REQ-1: PUT /restaurants/me/coupons/:id edita/desativa um cupom do próprio restaurante', async () => {
    const { couponRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/coupons/:id'],
      { restaurantId: 'r-1', params: { id: 'c-1' }, body: buildSaveBody({ isActive: false }) },
      { json },
    );

    expect(couponRepository.update).toHaveBeenCalledWith('c-1', expect.objectContaining({ isActive: false }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('PUT /restaurants/me/coupons/:id lança 404 quando o cupom é de outro restaurante', async () => {
    const { routes } = setup({
      couponRepository: { findById: jest.fn().mockResolvedValue(buildCoupon({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/coupons/:id'],
        { restaurantId: 'r-1', params: { id: 'c-1' }, body: buildSaveBody() },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejeita POST sem código', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/coupons'],
        { restaurantId: 'r-1', body: buildSaveBody({ code: '' }) },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita desconto percentual maior que 100%', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/coupons'],
        { restaurantId: 'r-1', body: buildSaveBody({ discountType: 'percentual', discountValue: 150 }) },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-2: POST /restaurants/:id/coupons/validate devolve o desconto de um cupom válido', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runCustomerChain(
      routes['POST /restaurants/:id/coupons/validate'],
      { params: { id: 'r-1' }, body: { code: 'promo10', orderSubtotal: 100 }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, { valid: true, discountAmount: 10 });
  });

  it('AC-3: POST /restaurants/:id/coupons/validate devolve motivo específico quando o código não existe', async () => {
    const { routes } = setup({ couponRepository: { findByCode: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await runCustomerChain(
      routes['POST /restaurants/:id/coupons/validate'],
      { params: { id: 'r-1' }, body: { code: 'INEXISTENTE', orderSubtotal: 100 }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, { valid: false, reason: 'Cupom não encontrado' });
  });

  it('AC-3: POST /restaurants/:id/coupons/validate devolve motivo específico quando o cupom está expirado', async () => {
    const { routes } = setup({
      couponRepository: {
        findByCode: jest.fn().mockResolvedValue(buildCoupon({ validUntil: '2020-01-01T00:00:00.000Z' })),
      },
    });
    const json = jest.fn();

    await runCustomerChain(
      routes['POST /restaurants/:id/coupons/validate'],
      { params: { id: 'r-1' }, body: { code: 'promo10', orderSubtotal: 100 }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, { valid: false, reason: 'Cupom expirado' });
  });

  it('AC-3: POST /restaurants/:id/coupons/validate devolve motivo específico quando o pedido não atinge o mínimo', async () => {
    const { routes } = setup({
      couponRepository: { findByCode: jest.fn().mockResolvedValue(buildCoupon({ minOrderValue: 50 })) },
    });
    const json = jest.fn();

    await runCustomerChain(
      routes['POST /restaurants/:id/coupons/validate'],
      { params: { id: 'r-1' }, body: { code: 'promo10', orderSubtotal: 30 }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, { valid: false, reason: 'Pedido mínimo de R$ 50.00 para usar este cupom' });
  });

  it('AC-6: POST /restaurants/:id/coupons/validate rejeita quando o cliente já usou o cupom o máximo permitido', async () => {
    const { orderRepository, routes } = setup({
      couponRepository: {
        findByCode: jest.fn().mockResolvedValue(buildCoupon({ usageLimit: 100, usageLimitPerCustomer: 1 })),
      },
      orderRepository: { countByCustomerAndCoupon: jest.fn().mockResolvedValue(1) },
    });
    const json = jest.fn();

    await runCustomerChain(
      routes['POST /restaurants/:id/coupons/validate'],
      { params: { id: 'r-1' }, body: { code: 'promo10', orderSubtotal: 100 }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.countByCustomerAndCoupon).toHaveBeenCalledWith('r-1', 'customer-1', 'PROMO10');
    expect(json).toHaveBeenCalledWith(200, {
      valid: false,
      reason: 'Você já usou esse cupom o número máximo de vezes permitido',
    });
  });
});
