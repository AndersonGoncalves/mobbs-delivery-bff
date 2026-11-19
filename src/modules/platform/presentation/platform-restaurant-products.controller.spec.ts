import type { Request, Response, Server } from 'restify';
import { ForbiddenError, NotFoundError } from 'restify-errors';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantProductsController } from './platform-restaurant-products.controller';

jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
jest.mock('../../../shared/storage/s3-client', () => ({ s3Client: {} }));

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query' | 'user'>>;
type FakeResponse = Pick<Response, 'json' | 'send' | 'header'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    patch: (path: string, ...handlers: RouteHandler[]) => { routes[`PATCH ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

function buildProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'p-1', restaurantId: 'r-1', name: 'Pizza', menuCategoryId: 'cat-1', price: 10, isAvailable: true, additionalGroups: [], ...overrides };
}

describe('PlatformRestaurantProductsController (tela de suporte, pedido explícito do usuário 18/11/2026)', () => {
  function setup(overrides: {
    menuCategoryRepository?: Partial<IMenuCategoryRepository>;
    productRepository?: Partial<IProductRepository>;
    allowedEmails?: string[];
  } = {}) {
    const menuCategoryRepository: Partial<IMenuCategoryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([{ id: 'cat-1', restaurantId: 'r-1', name: 'Pizzas' }]),
      ...overrides.menuCategoryRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildProduct()]),
      listByRestaurantPage: jest.fn().mockResolvedValue({ items: [buildProduct()], total: 1 }),
      create: jest.fn().mockResolvedValue(buildProduct({ id: 'p-2' })),
      update: jest.fn().mockResolvedValue(buildProduct({ name: 'Pizza atualizada' })),
      setAvailable: jest.fn().mockResolvedValue(buildProduct({ isAvailable: false })),
      findById: jest.fn().mockResolvedValue(buildProduct()),
      ...overrides.productRepository,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantProductsController(
      menuCategoryRepository as IMenuCategoryRepository,
      productRepository as IProductRepository,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { menuCategoryRepository, productRepository, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({
    params: { id: 'r-1' },
    user: { email: 'admin@bsdelivery.com.br' } as Request['user'],
    ...extra,
  });

  it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
    const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
    await expect(
      runAdminChain(routes['GET /platform/restaurants/:id/products'], adminReq({ query: {} }), { json: jest.fn(), send: jest.fn(), header: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('GET /menu-categories lista as categorias do restaurante informado', async () => {
    const { routes, menuCategoryRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/menu-categories'], adminReq(), { json, send: jest.fn(), header: jest.fn() });
    expect(menuCategoryRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [{ id: 'cat-1', restaurantId: 'r-1', name: 'Pizzas' }]);
  });

  it('GET /products sem page/pageSize devolve a lista inteira (não paginada)', async () => {
    const { routes, productRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/products'], adminReq({ query: {} }), { json, send: jest.fn(), header: jest.fn() });
    expect(productRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: undefined, isAvailable: undefined });
    expect(json).toHaveBeenCalledWith(200, [buildProduct()]);
  });

  it('GET /products com page/pageSize pagina no servidor e manda X-Total-Count', async () => {
    const { routes, productRepository } = setup();
    const json = jest.fn();
    const header = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/products'], adminReq({ query: { page: '1', pageSize: '25' } }), { json, send: jest.fn(), header });
    expect(productRepository.listByRestaurantPage).toHaveBeenCalledWith('r-1', { name: undefined, isAvailable: undefined }, { skip: 0, limit: 25 });
    expect(header).toHaveBeenCalledWith('X-Total-Count', '1');
    expect(json).toHaveBeenCalledWith(200, [buildProduct()]);
  });

  it('POST /products cria um produto novo pro restaurante informado', async () => {
    const { routes, productRepository } = setup();
    const json = jest.fn();
    const body = { menuCategoryId: 'cat-1', name: 'Pizza nova', price: 20, isAvailable: true };
    await runAdminChain(routes['POST /platform/restaurants/:id/products'], adminReq({ body }), { json, send: jest.fn(), header: jest.fn() });
    expect(productRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Pizza nova', price: 20 }));
    expect(json).toHaveBeenCalledWith(201, buildProduct({ id: 'p-2' }));
  });

  it('PUT /products/:productId atualiza um produto do restaurante informado', async () => {
    const { routes, productRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PUT /platform/restaurants/:id/products/:productId'],
      adminReq({ params: { id: 'r-1', productId: 'p-1' }, body: { name: 'Pizza atualizada' } }),
      { json, send: jest.fn(), header: jest.fn() },
    );
    expect(productRepository.update).toHaveBeenCalledWith('p-1', expect.objectContaining({ name: 'Pizza atualizada' }));
    expect(json).toHaveBeenCalledWith(200, buildProduct({ name: 'Pizza atualizada' }));
  });

  it('PUT /products/:productId rejeita (404) produto de outro restaurante', async () => {
    const { routes, productRepository } = setup({ productRepository: { findById: jest.fn().mockResolvedValue(buildProduct({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(
        routes['PUT /platform/restaurants/:id/products/:productId'],
        adminReq({ params: { id: 'r-1', productId: 'p-1' }, body: { name: 'x' } }),
        { json: jest.fn(), send: jest.fn(), header: jest.fn() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(productRepository.update).not.toHaveBeenCalled();
  });

  it('PATCH /products/:productId/available alterna a disponibilidade do produto', async () => {
    const { routes, productRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PATCH /platform/restaurants/:id/products/:productId/available'],
      adminReq({ params: { id: 'r-1', productId: 'p-1' }, body: { isAvailable: false } }),
      { json, send: jest.fn(), header: jest.fn() },
    );
    expect(productRepository.setAvailable).toHaveBeenCalledWith('p-1', false);
    expect(json).toHaveBeenCalledWith(200, buildProduct({ isAvailable: false }));
  });

  it('POST /uploads/presign assina a URL com o caminho do restaurante informado', async () => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/restaurants/r-1/products/abc.png?X-Amz-Signature=abc');
    const { routes } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['POST /platform/restaurants/:id/uploads/presign'],
      adminReq({ body: { kind: 'product', filename: 'foto.png' } }),
      { json, send: jest.fn(), header: jest.fn() },
    );
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      uploadUrl: expect.stringContaining('restaurants/r-1/products/'),
      publicUrl: expect.not.stringContaining('X-Amz-Signature'),
    }));
  });
});
