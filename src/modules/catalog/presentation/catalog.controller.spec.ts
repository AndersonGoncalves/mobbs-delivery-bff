import type { Request, Response, Server } from 'restify';

import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { CatalogController } from './catalog.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { restaurantId?: string; user?: { uid: string } };
type FakeResponse = Pick<Response, 'json'> & Partial<Pick<Response, 'send'>>;
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
    del: (path: string, ...handlers: RouteHandler[]) => {
      routes[`DELETE ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware (primeiro da chain) — tem spec própria
// (shared/http/firebase-auth.middleware.spec.ts).
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// Rotas /restaurants/me/... passam por firebaseAuthMiddleware + restaurantOperatorMiddleware —
// pula os dois (cada um tem spec própria) e injeta `req.restaurantId` manualmente, como o
// restaurantOperatorMiddleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildCategory() {
  return { id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0, products: [] };
}

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    restaurantId: 'r-1',
    menuCategoryId: 'c-1',
    name: 'Pizza',
    price: 50,
    isAvailable: true,
    additionalGroups: [],
    isFeatured: false,
    featuredOrder: 0,
    availableAsAdditional: false,
    ...overrides,
  };
}

describe('CatalogController', () => {
  function setup(
    overrides: {
      menuCategoryRepository?: Partial<IMenuCategoryRepository>;
      productRepository?: Partial<IProductRepository>;
      orderRepository?: Partial<IOrderRepository>;
      restaurantRepository?: Partial<IRestaurantRepository>;
      additionalGroupTemplateRepository?: Partial<IAdditionalGroupTemplateRepository>;
    } = {},
  ) {
    const menuCategoryRepository: Partial<IMenuCategoryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildCategory()]),
      create: jest.fn().mockResolvedValue({ id: 'c-2', restaurantId: 'r-1', name: 'Bebidas', sortOrder: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Lanches renomeado', sortOrder: 0 }),
      reorder: jest.fn().mockResolvedValue([buildCategory()]),
      findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0 }),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.menuCategoryRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findById: jest.fn().mockResolvedValue(buildProduct()),
      listByRestaurant: jest.fn().mockResolvedValue([buildProduct()]),
      create: jest.fn().mockResolvedValue(buildProduct({ id: 'p-2' })),
      update: jest.fn().mockResolvedValue(buildProduct({ name: 'Pizza atualizada' })),
      setAvailable: jest.fn().mockResolvedValue(buildProduct({ isAvailable: false })),
      remove: jest.fn().mockResolvedValue(undefined),
      findAnyByLinkedProductId: jest.fn().mockResolvedValue([]),
      ...overrides.productRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      countByProduct: jest.fn().mockResolvedValue(0),
      getBestSellingProductIds: jest.fn().mockResolvedValue([]),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'r-1', bestSellersCount: 6 }),
      ...overrides.restaurantRepository,
    };
    const additionalGroupTemplateRepository: Partial<IAdditionalGroupTemplateRepository> = {
      findAnyByLinkedProductId: jest.fn().mockResolvedValue([]),
      ...overrides.additionalGroupTemplateRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CatalogController(
      menuCategoryRepository as IMenuCategoryRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      additionalGroupTemplateRepository as IAdditionalGroupTemplateRepository,
    ).initializeRoutes(application);
    return { menuCategoryRepository, productRepository, orderRepository, restaurantRepository, additionalGroupTemplateRepository, routes };
  }

  it('AC-1: GET /restaurants/:id/menu-categories retorna as categorias do restaurante', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/menu-categories'], { params: { id: 'r-1' } }, { json });

    expect(menuCategoryRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'c-1' })]);
  });

  it('AC-3: GET /products/:id retorna o produto completo', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /products/:id'], { params: { id: 'p-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'p-1' }));
  });

  it('lança 404 quando o produto não existe', async () => {
    const { routes } = setup({ productRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(
      runAuthenticatedChain(routes['GET /products/:id'], { params: { id: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /restaurants/me/menu-categories usa o restaurantId do operador (token), não da rota', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/menu-categories'], { restaurantId: 'r-1' }, { json });

    expect(menuCategoryRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
  });

  it('AC-1: POST /restaurants/me/menu-categories cria categoria no restaurante do operador', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/menu-categories'],
      { restaurantId: 'r-1', body: { name: 'Bebidas' } },
      { json },
    );

    expect(menuCategoryRepository.create).toHaveBeenCalledWith('r-1', 'Bebidas');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'Bebidas' }));
  });

  it('PUT /restaurants/me/menu-categories/:id lança 404 se a categoria é de outro restaurante', async () => {
    const { routes } = setup({
      menuCategoryRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-OUTRO', name: 'Lanches', sortOrder: 0 }),
      },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/menu-categories/:id'],
        { restaurantId: 'r-1', params: { id: 'c-1' }, body: { name: 'Novo nome' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0061-categoria-ativa-inativa.
  it('PATCH /restaurants/me/menu-categories/:id/active desativa a categoria', async () => {
    const { menuCategoryRepository, routes } = setup({
      menuCategoryRepository: {
        setActive: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0, isActive: false }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/menu-categories/:id/active'],
      { restaurantId: 'r-1', params: { id: 'c-1' }, body: { isActive: false } },
      { json },
    );

    expect(menuCategoryRepository.setActive).toHaveBeenCalledWith('c-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('PATCH /restaurants/me/menu-categories/:id/active lança 404 se a categoria é de outro restaurante', async () => {
    const { routes } = setup({
      menuCategoryRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-OUTRO', name: 'Lanches', sortOrder: 0 }),
      },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/menu-categories/:id/active'],
        { restaurantId: 'r-1', params: { id: 'c-1' }, body: { isActive: false } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: PUT /restaurants/me/menu-categories/reorder reordena as categorias do restaurante', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/menu-categories/reorder'],
      { restaurantId: 'r-1', body: { orderedIds: ['c-2', 'c-1'] } },
      { json },
    );

    expect(menuCategoryRepository.reorder).toHaveBeenCalledWith('r-1', ['c-2', 'c-1']);
  });

  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5.
  it('AC-7: DELETE /restaurants/me/menu-categories/:id sem produtos exclui de verdade (204)', async () => {
    const { menuCategoryRepository, routes } = setup({
      productRepository: { countByMenuCategory: jest.fn().mockResolvedValue(0) },
    });
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/menu-categories/:id'],
      { restaurantId: 'r-1', params: { id: 'c-1' } },
      { json: jest.fn(), send },
    );

    expect(menuCategoryRepository.remove).toHaveBeenCalledWith('c-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-7: DELETE /restaurants/me/menu-categories/:id bloqueia (409) se tiver produtos', async () => {
    const { menuCategoryRepository, routes } = setup({
      productRepository: { countByMenuCategory: jest.fn().mockResolvedValue(3) },
    });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/menu-categories/:id'],
        { restaurantId: 'r-1', params: { id: 'c-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(menuCategoryRepository.remove).not.toHaveBeenCalled();
  });

  it('lança 404 ao tentar excluir categoria de outro restaurante', async () => {
    const { routes } = setup({
      menuCategoryRepository: { findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-OUTRO', name: 'Lanches', sortOrder: 0 }) },
    });

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/menu-categories/:id'],
        { restaurantId: 'r-1', params: { id: 'c-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-2: POST /restaurants/me/products cria produto com additionalGroups no restaurante do operador', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Sabor',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Calabresa', priceDelta: 0 }],
        },
      ],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Pizza' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'p-2' }));
  });

  it('AC-4: POST /restaurants/me/products rejeita produto sem preço', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/products'],
        { restaurantId: 'r-1', body: { menuCategoryId: 'c-1', name: 'Pizza' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-1: POST /restaurants/me/products persiste availableAsAdditional', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = { menuCategoryId: 'c-1', name: 'Coca-Cola 1L', price: 8, availableAsAdditional: true };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ availableAsAdditional: true }));
  });

  it('AC-2: POST /restaurants/me/products aceita opção de adicional com linkedProductId (sem rawMaterialId)', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Combo Família',
      price: 60,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Bebidas do combo',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Coca-Cola 1L', linkedProductId: 'prod-coca' }],
        },
      ],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({
        additionalGroups: [expect.objectContaining({ options: [expect.objectContaining({ linkedProductId: 'prod-coca' })] })],
      }),
    );
  });

  it('rejeita opção de adicional com rawMaterialId e linkedProductId ao mesmo tempo (400)', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Combo Família',
      price: 60,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Bebidas do combo',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: 'o-1', groupId: 'g-1', name: 'Coca-Cola 1L', priceDelta: -2, rawMaterialId: 'rm-1', linkedProductId: 'prod-coca' },
          ],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // specs/0044-promocoes-produtos (follow-up) — priceDelta é resolvido do produto vinculado,
  // nunca digitado: mandar os dois junto é rejeitado.
  it('rejeita opção de adicional com priceDelta e linkedProductId ao mesmo tempo (400)', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Combo Família',
      price: 60,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Bebidas do combo',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Coca-Cola 1L', priceDelta: -2, linkedProductId: 'prod-coca' }],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // specs/0044-promocoes-produtos (follow-up) — sem linkedProductId, priceDelta continua
  // obrigatório (preço livre digitado pelo operador).
  it('rejeita opção de adicional sem priceDelta e sem linkedProductId (400)', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Combo Família',
      price: 60,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Bebidas do combo',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Catupiry' }],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('PUT /restaurants/me/products/:id lança 404 se o produto é de outro restaurante', async () => {
    const { routes } = setup({
      productRepository: { findById: jest.fn().mockResolvedValue(buildProduct({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' }, body: { name: 'Novo nome' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-3: PATCH /restaurants/me/products/:id/available marca produto indisponível', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/products/:id/available'],
      { restaurantId: 'r-1', params: { id: 'p-1' }, body: { isAvailable: false } },
      { json },
    );

    expect(productRepository.setAvailable).toHaveBeenCalledWith('p-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isAvailable: false }));
  });

  // specs/0025-adicionais-reutilizaveis-remocao
  it('AC-2: POST /restaurants/me/products aceita um grupo vinculado a um template (referência mínima)', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [{ id: 'g-1', productId: 'p-2', templateId: 'tpl-1' }],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ additionalGroups: [{ id: 'g-1', productId: 'p-2', templateId: 'tpl-1' }] }),
    );
  });

  // Bug real reportado rodando a retaguarda de verdade: `AdditionalGroupBuilder.tsx` manda
  // `templateId` JUNTO com os campos resolvidos (nome/opções/etc — pro preview antes de salvar),
  // não só a referência mínima. Isso derrubava o vínculo no primeiro "Salvar" — o zod caía no
  // schema inline (que não conhece `templateId`) e descartava esse campo.
  it('PUT /restaurants/me/products/:id preserva templateId mesmo quando o payload também traz os campos resolvidos', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-1',
          templateId: 'tpl-1',
          name: 'Bordas',
          type: 'adicionar',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Borda Catupiry', priceDelta: 8 }],
        },
      ],
    };

    await runOperatorChain(routes['PUT /restaurants/me/products/:id'], { restaurantId: 'r-1', params: { id: 'p-1' }, body }, { json });

    expect(productRepository.update).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({
        additionalGroups: [expect.objectContaining({ id: 'g-1', productId: 'p-1', templateId: 'tpl-1' })],
      }),
    );
  });

  it('AC-9: POST /restaurants/me/products rejeita grupo inline "remover" com priceDelta diferente de 0', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'McFish Duplo',
      price: 49,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Deseja remover algum ingrediente?',
          type: 'remover',
          required: false,
          minSelections: 0,
          maxSelections: 4,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Molho tártaro', priceDelta: 4 }],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('POST /restaurants/me/products rejeita grupo inline obrigatório com Mín. seleções 0', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 49,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Escolha o sabor',
          type: 'adicionar',
          required: true,
          minSelections: 0,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Calabresa', priceDelta: 0 }],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('POST /restaurants/me/products rejeita grupo aninhado (nestedAdditionalGroups) obrigatório com Mín. seleções 0', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 49,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Escolha o sabor',
          type: 'adicionar',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            {
              id: 'o-1',
              groupId: 'g-1',
              name: 'Calabresa',
              priceDelta: 0,
              nestedAdditionalGroups: [
                {
                  id: 'g-nested',
                  productId: 'p-2',
                  name: 'Ingredientes extra',
                  type: 'adicionar',
                  required: true,
                  minSelections: 0,
                  maxSelections: 3,
                  options: [{ id: 'o-nested', groupId: 'g-nested', name: 'Bacon', priceDelta: 5 }],
                },
              ],
            },
          ],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('grupo inline sem "type" assume "adicionar" por padrão (retrocompatibilidade)', async () => {
    const { productRepository, routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Sabor',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Calabresa', priceDelta: 0 }],
        },
      ],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() });

    expect(productRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ additionalGroups: [expect.objectContaining({ type: 'adicionar' })] }),
    );
  });

  // specs/0026-selecao-clonar-excluir-busca-web
  it('REQ-7: GET /restaurants/me/products repassa name/isAvailable da query pro repositório', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/products'],
      { restaurantId: 'r-1', query: { name: 'piz', isAvailable: 'true' } },
      { json },
    );

    expect(productRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: 'piz', isAvailable: true });
  });

  it('AC-3: DELETE /restaurants/me/products/:id sem uso em pedidos exclui de verdade (204)', async () => {
    const { productRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/products/:id'],
      { restaurantId: 'r-1', params: { id: 'p-1' } },
      { json: jest.fn(), send },
    );

    expect(productRepository.remove).toHaveBeenCalledWith('p-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-4: DELETE /restaurants/me/products/:id bloqueia (409) se já apareceu em algum pedido', async () => {
    const { productRepository, routes } = setup({ orderRepository: { countByProduct: jest.fn().mockResolvedValue(1) } });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(productRepository.remove).not.toHaveBeenCalled();
  });

  it('AC-5: DELETE /restaurants/me/products/:id bloqueia (409) se vinculado como adicional em outro produto', async () => {
    const { productRepository, routes } = setup({
      productRepository: { findAnyByLinkedProductId: jest.fn().mockResolvedValue([{ id: 'p-combo', name: 'Combo Família' }]) },
    });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Combo Família') });

    expect(productRepository.remove).not.toHaveBeenCalled();
  });

  it('AC-5: DELETE /restaurants/me/products/:id bloqueia (409) se vinculado num template reutilizável', async () => {
    const { productRepository, routes } = setup({
      additionalGroupTemplateRepository: { findAnyByLinkedProductId: jest.fn().mockResolvedValue([{ id: 'tpl-1', name: 'Bebidas do combo' }]) },
    });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Bebidas do combo') });

    expect(productRepository.remove).not.toHaveBeenCalled();
  });

  it('lança 404 ao tentar excluir produto de outro restaurante', async () => {
    const { routes } = setup({
      productRepository: { findById: jest.fn().mockResolvedValue(buildProduct({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0028-destaques-vendidos-banners REQ-2.
  it('AC-1: GET /restaurants/:id/best-sellers devolve os produtos mais vendidos na ordem certa', async () => {
    const productP1 = buildProduct({ id: 'p-1' });
    const productP2 = buildProduct({ id: 'p-2' });
    const { orderRepository, restaurantRepository, productRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', bestSellersCount: 6 }) },
      orderRepository: { getBestSellingProductIds: jest.fn().mockResolvedValue(['p-2', 'p-1']) },
      productRepository: {
        findById: jest.fn(async (id: string) => (id === 'p-2' ? productP2 : productP1)),
      },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/best-sellers'], { params: { id: 'r-1' } }, { json });

    expect(restaurantRepository.findById).toHaveBeenCalledWith('r-1');
    expect(orderRepository.getBestSellingProductIds).toHaveBeenCalledWith('r-1', 6);
    expect(productRepository.findById).toHaveBeenNthCalledWith(1, 'p-2');
    expect(productRepository.findById).toHaveBeenNthCalledWith(2, 'p-1');
    expect(json).toHaveBeenCalledWith(200, [
      { ...productP2, hasAdditionalGroups: false },
      { ...productP1, hasAdditionalGroups: false },
    ]);
  });

  // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-5.
  it('AC-7: GET /restaurants/:id/best-sellers não inclui produto indisponível', async () => {
    const availableProduct = buildProduct({ id: 'p-1', isAvailable: true });
    const unavailableProduct = buildProduct({ id: 'p-2', isAvailable: false });
    const { routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', bestSellersCount: 6 }) },
      orderRepository: { getBestSellingProductIds: jest.fn().mockResolvedValue(['p-2', 'p-1']) },
      productRepository: {
        findById: jest.fn(async (id: string) => (id === 'p-2' ? unavailableProduct : availableProduct)),
      },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/best-sellers'], { params: { id: 'r-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, [{ ...availableProduct, hasAdditionalGroups: false }]);
  });

  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1.
  it('AC-1: GET /restaurants/:id/best-sellers marca hasAdditionalGroups quando o produto tem grupos', async () => {
    const productWithGroups = buildProduct({ id: 'p-1', additionalGroups: [{ id: 'g-1' }] });
    const { routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', bestSellersCount: 6 }) },
      orderRepository: { getBestSellingProductIds: jest.fn().mockResolvedValue(['p-1']) },
      productRepository: { findById: jest.fn().mockResolvedValue(productWithGroups) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/best-sellers'], { params: { id: 'r-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, [{ ...productWithGroups, hasAdditionalGroups: true }]);
  });

  // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login — endpoint leve dedicado a
  // "Destaques", reaproveitado pela seção "Peça também" do Carrinho.
  it('GET /restaurants/:id/featured-products devolve os produtos em destaque já na ordem do repositório', async () => {
    const productP2 = buildProduct({ id: 'p-2', featuredOrder: 0 });
    const productP1 = buildProduct({ id: 'p-1', featuredOrder: 1 });
    const { productRepository, routes } = setup({
      productRepository: { getFeatured: jest.fn().mockResolvedValue([productP2, productP1]) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/featured-products'], { params: { id: 'r-1' } }, { json });

    expect(productRepository.getFeatured).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [
      { ...productP2, hasAdditionalGroups: false },
      { ...productP1, hasAdditionalGroups: false },
    ]);
  });

  it('GET /restaurants/:id/featured-products marca hasAdditionalGroups quando o produto tem grupos', async () => {
    const productWithGroups = buildProduct({ id: 'p-1', additionalGroups: [{ id: 'g-1' }] });
    const { routes } = setup({
      productRepository: { getFeatured: jest.fn().mockResolvedValue([productWithGroups]) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/featured-products'], { params: { id: 'r-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, [{ ...productWithGroups, hasAdditionalGroups: true }]);
  });

  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1/AC-1.
  it('GET /restaurants/:id/purchased-product-ids devolve os ids do cliente logado', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { getPurchasedProductIds: jest.fn().mockResolvedValue(['p-1', 'p-2']) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['GET /restaurants/:id/purchased-product-ids'],
      { params: { id: 'r-1' }, user: { uid: 'cu-1' } },
      { json },
    );

    expect(orderRepository.getPurchasedProductIds).toHaveBeenCalledWith('cu-1', 'r-1');
    expect(json).toHaveBeenCalledWith(200, ['p-1', 'p-2']);
  });

  // specs/0028-destaques-vendidos-banners REQ-2/AC-2.
  it('AC-2: GET /restaurants/:id/best-sellers sem nenhum pedido entregue devolve lista vazia', async () => {
    const { routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', bestSellersCount: 6 }) },
      orderRepository: { getBestSellingProductIds: jest.fn().mockResolvedValue([]) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/best-sellers'], { params: { id: 'r-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, []);
  });

  // specs/0028-destaques-vendidos-banners REQ-3/AC-9.
  it('AC-9: PUT /restaurants/me/products/featured/reorder chama reorderFeatured com a nova ordem', async () => {
    const { productRepository, routes } = setup({
      productRepository: { reorderFeatured: jest.fn().mockResolvedValue([buildProduct({ id: 'p-2' }), buildProduct({ id: 'p-1' })]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/products/featured/reorder'],
      { restaurantId: 'r-1', body: { orderedIds: ['p-2', 'p-1'] } },
      { json },
    );

    expect(productRepository.reorderFeatured).toHaveBeenCalledWith('r-1', ['p-2', 'p-1']);
  });
});
