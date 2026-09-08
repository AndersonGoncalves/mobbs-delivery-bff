import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { RestaurantsController } from './restaurants.controller';

type FakeRequest = Pick<Request, 'params'>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler> = {};
  const application = {
    get: (path: string, handler: RouteHandler) => {
      routes[path] = handler;
    },
  };
  return { application: application as unknown as Server, routes };
}

describe('RestaurantsController', () => {
  it('AC-1: retorna 200 com o restaurante quando o slug corresponde a um ativo', async () => {
    const repository: IRestaurantRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: '1',
        name: 'Prime Pizza',
        slug: 'primepizza',
        isActive: true,
        businessHours: [],
      }),
    };
    const { application, routes } = buildFakeApplication();
    new RestaurantsController(repository).initializeRoutes(application);

    const json = jest.fn();
    await routes['/restaurants/resolve/:slug']({ params: { slug: 'primepizza' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
  });

  it('AC-2/AC-6: lança erro 404 quando o slug não corresponde a nenhum restaurante', async () => {
    const repository: IRestaurantRepository = { findBySlug: jest.fn().mockResolvedValue(null) };
    const { application, routes } = buildFakeApplication();
    new RestaurantsController(repository).initializeRoutes(application);

    await expect(
      routes['/restaurants/resolve/:slug']({ params: { slug: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lança erro 404 quando o restaurante existe mas está inativo', async () => {
    const repository: IRestaurantRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: '1',
        name: 'Restaurante Fechado',
        slug: 'fechado',
        isActive: false,
        businessHours: [],
      }),
    };
    const { application, routes } = buildFakeApplication();
    new RestaurantsController(repository).initializeRoutes(application);

    await expect(
      routes['/restaurants/resolve/:slug']({ params: { slug: 'fechado' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
