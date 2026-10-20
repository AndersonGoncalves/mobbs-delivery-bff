import type { Request, Response, Server } from 'restify';

import { IAccountReceivableRepository } from '../domain/repositories/account-receivable.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { AccountsReceivableController } from './accounts-receivable.controller';

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

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ar-1',
    restaurantId: 'r-1',
    description: 'Fiado - Empresa X',
    issueDate: '2026-09-01T00:00:00.000Z',
    dueDate: '2026-09-10T00:00:00.000Z',
    value: 300,
    status: 'aberto',
    ...overrides,
  };
}

describe('AccountsReceivableController', () => {
  function setup(
    overrides: {
      accountReceivableRepository?: Partial<IAccountReceivableRepository>;
      cashRegisterRepository?: Partial<ICashRegisterRepository>;
    } = {},
  ) {
    const accountReceivableRepository: Partial<IAccountReceivableRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildAccount()]),
      findById: jest.fn().mockResolvedValue(buildAccount()),
      create: jest.fn().mockResolvedValue(buildAccount()),
      update: jest.fn().mockResolvedValue(buildAccount({ description: 'Fiado - Empresa Y' })),
      markAsReceived: jest
        .fn()
        .mockResolvedValue(buildAccount({ status: 'pago', receivedValue: 300, receivedAt: '2026-09-09T00:00:00.000Z' })),
      ...overrides.accountReceivableRepository,
    };
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue({ id: 'cr-1', restaurantId: 'r-1', status: 'aberto' }),
      addMovement: jest.fn().mockResolvedValue({ id: 'mv-1' }),
      ...overrides.cashRegisterRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new AccountsReceivableController(
      accountReceivableRepository as IAccountReceivableRepository,
      cashRegisterRepository as ICashRegisterRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { accountReceivableRepository, cashRegisterRepository, routes };
  }

  it('AC-3: GET /restaurants/me/accounts-receivable lista os títulos a receber do restaurante do operador', async () => {
    const { accountReceivableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/accounts-receivable'], { restaurantId: 'r-1' }, { json });

    expect(accountReceivableRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'ar-1' })]);
  });

  it('AC-3: POST /restaurants/me/accounts-receivable cria um título a receber em aberto', async () => {
    const { accountReceivableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/accounts-receivable'],
      {
        restaurantId: 'r-1',
        body: { description: 'Fiado - Empresa X', issueDate: '2026-09-01', dueDate: '2026-09-10', value: 300 },
      },
      { json },
    );

    expect(accountReceivableRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ description: 'Fiado - Empresa X', value: 300 }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
  });

  it('REQ-3: PUT /restaurants/me/accounts-receivable/:id edita um título existente', async () => {
    const { accountReceivableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/accounts-receivable/:id'],
      {
        restaurantId: 'r-1',
        params: { id: 'ar-1' },
        body: { description: 'Fiado - Empresa Y', issueDate: '2026-10-01', dueDate: '2026-10-10', value: 300 },
      },
      { json },
    );

    expect(accountReceivableRepository.update).toHaveBeenCalledWith('ar-1', expect.objectContaining({ description: 'Fiado - Empresa Y' }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ description: 'Fiado - Empresa Y' }));
  });

  it('REQ-3: PATCH .../receive marca o título como recebido com data/valor recebidos', async () => {
    const { accountReceivableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-receivable/:id/receive'],
      { restaurantId: 'r-1', params: { id: 'ar-1' }, body: { receivedValue: 300, receivedAt: '2026-09-09T00:00:00.000Z' } },
      { json },
    );

    expect(accountReceivableRepository.markAsReceived).toHaveBeenCalledWith('ar-1', 300, new Date('2026-09-09T00:00:00.000Z'));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'pago' }));
  });

  // Pedido explícito do usuário — liquidar um título a receber pode opcionalmente lançar uma
  // entrada no Movimento de Caixa, quando há sessão aberta. Default (campo omitido) é `true`.
  it('REQ-3: PATCH .../receive sem affectsCashRegister (default true) lança uma entrada no caixa aberto', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-receivable/:id/receive'],
      { restaurantId: 'r-1', params: { id: 'ar-1' }, body: { receivedValue: 300 } },
      { json },
    );

    expect(cashRegisterRepository.findOpenSessionByRestaurant).toHaveBeenCalledWith('r-1');
    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith(
      'cr-1',
      expect.objectContaining({ type: 'entrada', amount: 300, description: expect.stringContaining('Fiado - Empresa X') }),
    );
  });

  it('REQ-3: PATCH .../receive com affectsCashRegister: false não lança nada no caixa', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-receivable/:id/receive'],
      { restaurantId: 'r-1', params: { id: 'ar-1' }, body: { receivedValue: 300, affectsCashRegister: false } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('REQ-3: PATCH .../receive com affectsCashRegister: true mas sem sessão de caixa aberta não lança nada (não força abertura)', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-receivable/:id/receive'],
      { restaurantId: 'r-1', params: { id: 'ar-1' }, body: { receivedValue: 300, affectsCashRegister: true } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('lança 404 ao operar sobre um título de outro restaurante', async () => {
    const { routes } = setup({
      accountReceivableRepository: { findById: jest.fn().mockResolvedValue(buildAccount({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/accounts-receivable/:id/receive'],
        { restaurantId: 'r-1', params: { id: 'ar-1' }, body: { receivedValue: 300 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
