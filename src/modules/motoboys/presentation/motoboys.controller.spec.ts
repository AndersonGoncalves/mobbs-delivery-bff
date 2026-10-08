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

describe('MotoboysController (specs/0119-cadastro-motoboys)', () => {
  function setup(overrides: { motoboyRepository?: Partial<IMotoboyRepository> } = {}) {
    const motoboyRepository: Partial<IMotoboyRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildMotoboy()]),
      findById: jest.fn().mockResolvedValue(buildMotoboy()),
      create: jest.fn().mockResolvedValue(buildMotoboy()),
      update: jest.fn().mockResolvedValue(buildMotoboy({ name: 'João Silva' })),
      setActive: jest.fn().mockResolvedValue(buildMotoboy({ isActive: false })),
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

  it('AC-1: POST /restaurants/me/motoboys cria um motoboy', async () => {
    const { motoboyRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/motoboys'],
      { restaurantId: 'r-1', body: { name: 'João', whatsapp: '11999990000' } },
      { json },
    );

    expect(motoboyRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'João', whatsapp: '11999990000', canMarkAsDelivered: true }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ isActive: true }));
  });

  it('rejeita criação sem nome', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/motoboys'], { restaurantId: 'r-1', body: { whatsapp: '11999990000' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita criação sem WhatsApp', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/motoboys'], { restaurantId: 'r-1', body: { name: 'João' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('REQ-1: PUT /restaurants/me/motoboys/:id edita um motoboy existente', async () => {
    const { motoboyRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/motoboys/:id'],
      { restaurantId: 'r-1', params: { id: 'mt-1' }, body: { name: 'João Silva', whatsapp: '11999990000' } },
      { json },
    );

    expect(motoboyRepository.update).toHaveBeenCalledWith('mt-1', expect.objectContaining({ name: 'João Silva' }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ name: 'João Silva' }));
  });

  it('REQ-4: PATCH .../active desativa um motoboy', async () => {
    const { motoboyRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/motoboys/:id/active'],
      { restaurantId: 'r-1', params: { id: 'mt-1' }, body: { isActive: false } },
      { json },
    );

    expect(motoboyRepository.setActive).toHaveBeenCalledWith('mt-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('lança 404 ao operar sobre um motoboy de outro restaurante', async () => {
    const { routes } = setup({
      motoboyRepository: { findById: jest.fn().mockResolvedValue(buildMotoboy({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/motoboys/:id'],
        { restaurantId: 'r-1', params: { id: 'mt-1' }, body: { name: 'X', whatsapp: '11999990000' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
