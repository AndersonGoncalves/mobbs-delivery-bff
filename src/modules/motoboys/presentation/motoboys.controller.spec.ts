import type { Request, Response, Server } from 'restify';

import { IMotoboyRepository } from '../domain/repositories/motoboy.repository.interface';
import { MotoboysController } from './motoboys.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildMotoboy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mt-1',
    restaurantId: 'r-1',
    name: 'João',
    whatsapp: '11999990000',
    canMarkAsDelivered: true,
    isActive: true,
    ...overrides,
  };
}

/**
 * (ajuste, pedido explícito do usuário) — POST/PUT/PATCH deste cadastro legado (`Motoboy`,
 * specs/0119) saíram do controller: "Cadastro de motoboys" na web virou só leitura, listando
 * `RestaurantOperator` com papel `motoboy` (ver restaurant-operators.controller.spec.ts). Só o GET
 * continua existindo aqui (dado antigo não foi apagado do banco).
 */
describe('MotoboysController (specs/0119-cadastro-motoboys)', () => {
  function setup(overrides: { motoboyRepository?: Partial<IMotoboyRepository> } = {}) {
    const motoboyRepository: Partial<IMotoboyRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildMotoboy()]),
      ...overrides.motoboyRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new MotoboysController(motoboyRepository as IMotoboyRepository, restaurantOperatorMiddleware).initializeRoutes(application);
    return { motoboyRepository, routes };
  }

  it('AC-1: GET /restaurants/me/motoboys lista os motoboys do restaurante do operador', async () => {
    const { motoboyRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/motoboys'], { restaurantId: 'r-1' }, { json });

    expect(motoboyRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'mt-1' })]);
  });

  it('não registra mais rotas de escrita (POST/PUT/PATCH)', () => {
    const { routes } = setup();

    expect(routes['POST /restaurants/me/motoboys']).toBeUndefined();
    expect(routes['PUT /restaurants/me/motoboys/:id']).toBeUndefined();
    expect(routes['PATCH /restaurants/me/motoboys/:id/active']).toBeUndefined();
  });
});
