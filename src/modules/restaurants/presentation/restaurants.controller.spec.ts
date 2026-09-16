import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { RestaurantsController } from './restaurants.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId' | 'query'>>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = {
    get: register('GET'),
    put: register('PUT'),
    patch: register('PATCH'),
    post: register('POST'),
    del: register('DEL'),
  };
  return { application: application as unknown as Server, routes };
}

async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

// Pula `firebaseAuthMiddleware` (primeiro da chain autenticada) — tem spec própria
// (firebase-auth.middleware.spec.ts); aqui o foco é só o comportamento do controller a partir do
// restaurantOperatorMiddleware (fake, sempre resolve restaurantId '1') em diante.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  return runChain(handlers.slice(1), req, res);
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = '1';
};

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    ...overrides,
  };
}

describe('RestaurantsController', () => {
  describe('GET /restaurants/resolve/:slug (público)', () => {
    it('AC-1: retorna 200 com o restaurante quando o slug corresponde a um ativo', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant()),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'primepizza' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    it('AC-2/AC-6: lança erro 404 quando o slug não corresponde a nenhum restaurante', async () => {
      const repository: Partial<IRestaurantRepository> = { findBySlug: jest.fn().mockResolvedValue(null) };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'inexistente' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lança erro 404 quando o restaurante existe mas está inativo', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false, slug: 'fechado' })),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'fechado' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10/AC-12.
  describe('GET /restaurants/:id/delivery-fee (público)', () => {
    it('resolve o feeCents da zona correspondente ao bairro', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({
            deliveryFeeMode: 'byNeighborhood',
            deliveryFeeZones: [
              { id: 'z-1', neighborhood: 'Centro', feeCents: 500 },
              { id: 'z-2', neighborhood: 'Jardins', feeCents: 800 },
            ],
          }),
        ),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: '1' }, query: { neighborhood: 'Jardins' } }, { json });

      expect(json).toHaveBeenCalledWith(200, { feeCents: 800 });
    });

    it('bairro não cadastrado volta feeCents null, sem lançar erro', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({ deliveryFeeMode: 'byNeighborhood', deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: 500 }] }),
        ),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: '1' }, query: { neighborhood: 'Inexistente' } }, { json });

      expect(json).toHaveBeenCalledWith(200, { feeCents: null });
    });

    it('lança 404 quando o restaurante não existe', async () => {
      const repository: Partial<IRestaurantRepository> = { findById: jest.fn().mockResolvedValue(null) };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: 'inexistente' }, query: {} }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('rotas autenticadas /restaurants/me/... (specs/0010)', () => {
    function setup(repositoryOverrides: Partial<IRestaurantRepository> = {}) {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(buildRestaurant()),
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ name: 'Novo nome' })),
        updateBusinessHours: jest.fn().mockResolvedValue(buildRestaurant()),
        setActive: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })),
        updateSlug: jest.fn().mockResolvedValue(buildRestaurant({ slug: 'novo-slug' })),
        ...repositoryOverrides,
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );
      return { repository, routes };
    }

    it('AC-1: GET /restaurants/me retorna o restaurante do restaurantId resolvido pelo token', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me'], { restaurantId: undefined }, { json });

      expect(repository.findById).toHaveBeenCalledWith('1');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    it('AC-1/AC-7: PUT /restaurants/me valida o payload e persiste só os campos enviados', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { name: 'Novo nome' } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { name: 'Novo nome' });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ name: 'Novo nome' }));
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-2.
    it('PUT /restaurants/me aceita e persiste shareMessage', async () => {
      const shareMessage = 'Olá! Queria te indicar o InstaDelivery...';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ shareMessage })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { shareMessage } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { shareMessage });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ shareMessage }));
    });

    it('rejeita PUT /restaurants/me com cor fora do formato #RRGGBB', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { primaryColor: 'azul' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-4.
    it('rejeita PUT /restaurants/me com CNPJ inválido', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { document: '11222333000100' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('PUT /restaurants/me aceita e persiste um CNPJ válido', async () => {
      const document = '11222333000181';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ document })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { document } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { document });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ document }));
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-8.
    it('PUT /restaurants/me aceita e persiste productImageOnRight', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ productImageOnRight: false })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { productImageOnRight: false } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { productImageOnRight: false });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ productImageOnRight: false }));
    });

    it('PUT /restaurants/me aceita e persiste onPrimaryColor', async () => {
      const onPrimaryColor = '#000000';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ onPrimaryColor })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { onPrimaryColor } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { onPrimaryColor });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ onPrimaryColor }));
    });

    it('rejeita PUT /restaurants/me com onPrimaryColor fora do formato #RRGGBB', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { onPrimaryColor: 'branco' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-1.
    it('PUT /restaurants/me aceita e persiste defaultProductImageUrl', async () => {
      const defaultProductImageUrl = 'https://storage.example.com/restaurants/1/default-product-image.png';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ defaultProductImageUrl })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { defaultProductImageUrl } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { defaultProductImageUrl });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ defaultProductImageUrl }));
    });

    it('rejeita PUT /restaurants/me com defaultProductImageUrl que não é uma URL', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { defaultProductImageUrl: 'não-é-url' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0028-destaques-vendidos-banners REQ-1, REQ-4, REQ-10.
    it('PUT /restaurants/me aceita e persiste showBestSellers/bestSellersCount/showHighlights/showBanners', async () => {
      const patch = { showBestSellers: true, bestSellersCount: 8, showHighlights: false, showBanners: false };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2.
    it('PUT /restaurants/me aceita e persiste allowCustomerCancelOrder', async () => {
      const patch = { allowCustomerCancelOrder: false };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10/REQ-9.
    it('PUT /restaurants/me aceita e persiste deliveryFeeMode/deliveryFeeZones/instagramUrl', async () => {
      const patch = {
        deliveryFeeMode: 'byNeighborhood' as const,
        deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: 500 }],
        instagramUrl: 'https://instagram.com/primepizza',
      };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    it('rejeita PUT /restaurants/me com deliveryFeeZones com feeCents negativo', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['PUT /restaurants/me'],
          { body: { deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: -1 }] } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita PUT /restaurants/me com instagramUrl que não é uma URL', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { instagramUrl: 'não-é-url' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita PUT /restaurants/me com bestSellersCount não positivo', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { bestSellersCount: 0 } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0028-destaques-vendidos-banners REQ-5/REQ-6 — bannerSchema.superRefine.
    it('PUT /restaurants/me aceita e persiste banners com o campo de destino certo por linkType', async () => {
      const banners = [
        { id: 'b-1', imageUrl: 'https://exemplo.com/1.png', linkType: 'product', productId: 'p-1' },
        { id: 'b-2', imageUrl: 'https://exemplo.com/2.png', linkType: 'category', menuCategoryId: 'c-1' },
        { id: 'b-3', imageUrl: 'https://exemplo.com/3.png', linkType: 'externalUrl', externalUrl: 'https://exemplo.com' },
        { id: 'b-4', imageUrl: 'https://exemplo.com/4.png', linkType: 'none' },
      ];
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ banners })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { banners } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { banners });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ banners }));
    });

    it.each([
      ['product', {}],
      ['category', {}],
      ['externalUrl', {}],
    ])('rejeita banner com linkType "%s" sem o campo de destino correspondente', async (linkType, extra) => {
      const { routes } = setup();
      const banners = [{ id: 'b-1', imageUrl: 'https://exemplo.com/1.png', linkType, ...extra }];

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { banners } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-6: rejeita horário com fechamento antes da abertura no mesmo dia', async () => {
      const { routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '18:00', closeTime: '08:00' }];

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-2: PUT /restaurants/me/business-hours aceita horário válido', async () => {
      const { repository, routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '08:00', closeTime: '18:00' }];
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json });

      expect(repository.updateBusinessHours).toHaveBeenCalledWith('1', body);
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('AC-3: PATCH /restaurants/me/active desativa o restaurante', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PATCH /restaurants/me/active'], { body: { isActive: false } }, { json });

      expect(repository.setActive).toHaveBeenCalledWith('1', false);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
    });

    it('AC-4/AC-5: GET /restaurants/me/onboarding retorna URL web e link nativo a partir do slug', async () => {
      const { routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me/onboarding'], {}, { json });

      expect(json).toHaveBeenCalledWith(200, {
        slug: 'primepizza',
        webUrl: 'https://primepizza.bsdelivery.com.br',
        nativeLink: 'https://bsdelivery.com.br/r/primepizza',
      });
    });

    it('AC-11: PUT /restaurants/me/slug troca o slug', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'novo-slug' } }, { json });

      expect(repository.updateSlug).toHaveBeenCalledWith('1', 'novo-slug');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'novo-slug' }));
    });

    it('rejeita PUT /restaurants/me/slug com caractere inválido', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'Slug Inválido!' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
