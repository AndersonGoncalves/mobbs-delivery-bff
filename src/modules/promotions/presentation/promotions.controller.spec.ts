import type { Request, Response, Server } from 'restify';

import { IPromotion } from '../domain/entities/promotion.entity';
import { IPromotionRepository } from '../domain/repositories/promotion.repository.interface';
import { PromotionsController } from './promotions.controller';

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
    put: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PUT ${path}`] = handlers;
    },
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// `/restaurants/me/promotions*` passa por firebaseAuthMiddleware + restaurantOperatorMiddleware +
// requireOperatorRole — mesmo padrão de coupons.controller.spec.ts.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildPromotion(overrides: Partial<IPromotion> = {}): IPromotion {
  return {
    id: 'promo-1',
    restaurantId: 'r-1',
    name: 'Promoção de terça',
    discountPercentage: 20,
    productIds: ['p-1', 'p-2'],
    isActive: true,
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function setup(overrides: { promotionRepository?: Partial<IPromotionRepository> } = {}) {
  const promotionRepository: Partial<IPromotionRepository> = {
    findByRestaurantId: jest.fn().mockResolvedValue([buildPromotion()]),
    findActiveByRestaurantId: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(buildPromotion()),
    create: jest.fn().mockResolvedValue(buildPromotion()),
    update: jest.fn().mockResolvedValue(buildPromotion()),
    setActive: jest.fn().mockResolvedValue(buildPromotion({ isActive: false })),
    ...overrides.promotionRepository,
  };
  const restaurantOperatorMiddleware = jest.fn(async () => {});
  const { application, routes } = buildFakeApplication();
  new PromotionsController(promotionRepository as IPromotionRepository, restaurantOperatorMiddleware).initializeRoutes(application);
  return { promotionRepository, routes };
}

describe('PromotionsController (specs/0044-promocoes-produtos)', () => {
  it('AC-1: GET /restaurants/me/promotions lista as promoções do restaurante do operador', async () => {
    const { promotionRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/promotions'], { restaurantId: 'r-1' }, { json });

    expect(promotionRepository.findByRestaurantId).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'promo-1' })]);
  });

  it('AC-1: POST /restaurants/me/promotions cria a promoção com os produtos certos', async () => {
    const { promotionRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      name: 'Promoção de terça',
      discountPercentage: 20,
      productIds: ['p-1', 'p-2'],
      isActive: true,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };

    await runOperatorChain(routes['POST /restaurants/me/promotions'], { restaurantId: 'r-1', body }, { json });

    expect(promotionRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ productIds: ['p-1', 'p-2'] }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'promo-1' }));
  });

  it('AC-5: POST rejeita (409) quando um produto já está em outra promoção ativa', async () => {
    const { promotionRepository, routes } = setup({
      promotionRepository: {
        findActiveByRestaurantId: jest.fn().mockResolvedValue([buildPromotion({ id: 'promo-2', productIds: ['p-2'] })]),
      },
    });
    const body = { name: 'Nova', discountPercentage: 10, productIds: ['p-2'], isActive: true, startDate: '2026-09-01', endDate: '2026-09-30' };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/promotions'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(promotionRepository.create).not.toHaveBeenCalled();
  });

  it('criar como isActive:false não checa conflito (produto ainda não fica ativo)', async () => {
    const { promotionRepository, routes } = setup();
    const body = { name: 'Rascunho', discountPercentage: 10, productIds: ['p-1'], isActive: false, startDate: '2026-09-01', endDate: '2026-09-30' };

    await runOperatorChain(routes['POST /restaurants/me/promotions'], { restaurantId: 'r-1', body }, { json: jest.fn() });

    expect(promotionRepository.findActiveByRestaurantId).not.toHaveBeenCalled();
    expect(promotionRepository.create).toHaveBeenCalled();
  });

  it('PUT /restaurants/me/promotions/:id edita, sem conflitar consigo mesma', async () => {
    const { promotionRepository, routes } = setup({
      promotionRepository: {
        findActiveByRestaurantId: jest.fn().mockResolvedValue([buildPromotion({ id: 'promo-1', productIds: ['p-1', 'p-2'] })]),
      },
    });
    const body = { name: 'Editada', discountPercentage: 25, productIds: ['p-1', 'p-2'], isActive: true, startDate: '2026-09-01', endDate: '2026-09-30' };

    await runOperatorChain(routes['PUT /restaurants/me/promotions/:id'], { params: { id: 'promo-1' }, restaurantId: 'r-1', body }, { json: jest.fn() });

    expect(promotionRepository.update).toHaveBeenCalledWith('promo-1', expect.objectContaining({ name: 'Editada' }));
  });

  it('PUT lança 404 quando a promoção é de outro restaurante', async () => {
    const { routes } = setup({ promotionRepository: { findById: jest.fn().mockResolvedValue(buildPromotion({ restaurantId: 'outro' })) } });
    const body = { name: 'X', discountPercentage: 10, productIds: ['p-1'], isActive: true, startDate: '2026-09-01', endDate: '2026-09-30' };

    await expect(
      runOperatorChain(routes['PUT /restaurants/me/promotions/:id'], { params: { id: 'promo-1' }, restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-6/REQ-6: PATCH .../active reativa a promoção', async () => {
    const { promotionRepository, routes } = setup({
      promotionRepository: { setActive: jest.fn().mockResolvedValue(buildPromotion({ isActive: true })) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/promotions/:id/active'],
      { params: { id: 'promo-1' }, restaurantId: 'r-1', body: { isActive: true } },
      { json },
    );

    expect(promotionRepository.setActive).toHaveBeenCalledWith('promo-1', true);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: true }));
  });

  it('AC-5: PATCH .../active com isActive:true rejeita (409) se algum produto já está em outra promoção ativa', async () => {
    const { promotionRepository, routes } = setup({
      promotionRepository: {
        findById: jest.fn().mockResolvedValue(buildPromotion({ productIds: ['p-1'] })),
        findActiveByRestaurantId: jest.fn().mockResolvedValue([buildPromotion({ id: 'promo-2', productIds: ['p-1'] })]),
      },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/promotions/:id/active'],
        { params: { id: 'promo-1' }, restaurantId: 'r-1', body: { isActive: true } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(promotionRepository.setActive).not.toHaveBeenCalled();
  });

  it('PATCH .../active com isActive:false não checa conflito', async () => {
    const { promotionRepository, routes } = setup();

    await runOperatorChain(
      routes['PATCH /restaurants/me/promotions/:id/active'],
      { params: { id: 'promo-1' }, restaurantId: 'r-1', body: { isActive: false } },
      { json: jest.fn() },
    );

    expect(promotionRepository.findActiveByRestaurantId).not.toHaveBeenCalled();
    expect(promotionRepository.setActive).toHaveBeenCalledWith('promo-1', false);
  });
});
