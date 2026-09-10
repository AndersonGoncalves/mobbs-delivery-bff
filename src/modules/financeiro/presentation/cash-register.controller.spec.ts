import type { Request, Response, Server } from 'restify';

import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { CashRegisterController } from './cash-register.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string; user?: { uid: string } };
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
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr-1',
    restaurantId: 'r-1',
    openedAt: '2026-09-09T08:00:00.000Z',
    openingBalance: 100,
    status: 'aberto',
    openedBy: 'operator-1',
    ...overrides,
  };
}

function buildMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    cashRegisterSessionId: 'cr-1',
    type: 'entrada',
    amount: 50,
    description: 'Venda #1 (Pix)',
    createdAt: '2026-09-09T09:00:00.000Z',
    ...overrides,
  };
}

describe('CashRegisterController', () => {
  function setup(overrides: { cashRegisterRepository?: Partial<ICashRegisterRepository> } = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(buildSession()),
      open: jest.fn().mockResolvedValue(buildSession()),
      addMovement: jest.fn().mockResolvedValue(buildMovement()),
      listMovements: jest.fn().mockResolvedValue([buildMovement()]),
      getCalculatedBalance: jest.fn().mockResolvedValue(150),
      close: jest.fn().mockResolvedValue({ session: buildSession({ status: 'fechado', closingBalance: 150 }), calculatedBalance: 150, difference: 0 }),
      ...overrides.cashRegisterRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CashRegisterController(cashRegisterRepository as ICashRegisterRepository, restaurantOperatorMiddleware).initializeRoutes(
      application,
    );
    return { cashRegisterRepository, routes };
  }

  it('GET /restaurants/me/cash-register/open devolve session:null quando não há sessão aberta', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, { session: null, movements: [], calculatedBalance: 0 });
  });

  it('GET /restaurants/me/cash-register/open devolve a sessão aberta com movimentos e saldo calculado', async () => {
    const { routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, {
      session: expect.objectContaining({ id: 'cr-1' }),
      movements: [expect.objectContaining({ id: 'mv-1' })],
      calculatedBalance: 150,
    });
  });

  it('AC-4: POST /restaurants/me/cash-register/open abre uma sessão com o valor inicial informado', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, body: { openingBalance: 100 } },
      { json },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 100, 'operator-1');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
  });

  it('AC-8: POST /restaurants/me/cash-register/open bloqueia e indica a sessão já aberta', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/open'],
        { restaurantId: 'r-1', user: { uid: 'operator-1' }, body: { openingBalance: 100 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('cr-1') });
    expect(cashRegisterRepository.open).not.toHaveBeenCalled();
  });

  it('AC-6: POST .../:id/movements lança um movimento manual (sangria) numa sessão aberta', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/:id/movements'],
      { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'saida', amount: 30, description: 'Sangria' } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', { type: 'saida', amount: 30, description: 'Sangria' });
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'mv-1' }));
  });

  it('POST .../:id/movements rejeita lançamento numa sessão já fechada', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/movements'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'entrada', amount: 30, description: 'X' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('lança 404 ao lançar movimento numa sessão de outro restaurante', async () => {
    const { routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/movements'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'entrada', amount: 30, description: 'X' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-7: POST .../:id/close mostra a diferença entre o saldo calculado e o valor contado', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: {
        close: jest.fn().mockResolvedValue({
          session: buildSession({ status: 'fechado', closingBalance: 140 }),
          calculatedBalance: 150,
          difference: -10,
        }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'cr-1' }, body: { countedValue: 140 } },
      { json },
    );

    expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 140, 'operator-1');
    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ calculatedBalance: 150, difference: -10, session: expect.objectContaining({ status: 'fechado' }) }),
    );
  });

  it('POST .../:id/close rejeita fechar uma sessão já fechada', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/close'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { countedValue: 100 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cashRegisterRepository.close).not.toHaveBeenCalled();
  });
});
