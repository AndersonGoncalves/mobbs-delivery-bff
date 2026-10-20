import type { Request, Response, Server } from 'restify';

import { IAccountPayableRepository } from '../domain/repositories/account-payable.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { AccountsPayableController } from './accounts-payable.controller';

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
    id: 'ap-1',
    restaurantId: 'r-1',
    description: 'Aluguel setembro',
    issueDate: '2026-09-01T00:00:00.000Z',
    dueDate: '2026-09-10T00:00:00.000Z',
    value: 1500,
    status: 'aberto',
    ...overrides,
  };
}

describe('AccountsPayableController', () => {
  function setup(
    overrides: {
      accountPayableRepository?: Partial<IAccountPayableRepository>;
      cashRegisterRepository?: Partial<ICashRegisterRepository>;
    } = {},
  ) {
    const accountPayableRepository: Partial<IAccountPayableRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildAccount()]),
      findById: jest.fn().mockResolvedValue(buildAccount()),
      create: jest.fn().mockResolvedValue(buildAccount()),
      update: jest.fn().mockResolvedValue(buildAccount({ description: 'Aluguel outubro' })),
      markAsPaid: jest.fn().mockResolvedValue(buildAccount({ status: 'pago', paidValue: 1500, paidAt: '2026-09-09T00:00:00.000Z' })),
      ...overrides.accountPayableRepository,
    };
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue({ id: 'cr-1', restaurantId: 'r-1', status: 'aberto' }),
      addMovement: jest.fn().mockResolvedValue({ id: 'mv-1' }),
      ...overrides.cashRegisterRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new AccountsPayableController(
      accountPayableRepository as IAccountPayableRepository,
      cashRegisterRepository as ICashRegisterRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { accountPayableRepository, cashRegisterRepository, routes };
  }

  it('AC-1: GET /restaurants/me/accounts-payable lista os títulos a pagar do restaurante do operador', async () => {
    const { accountPayableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/accounts-payable'], { restaurantId: 'r-1' }, { json });

    expect(accountPayableRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'ap-1' })]);
  });

  it('AC-1: POST /restaurants/me/accounts-payable cria um título a pagar em aberto', async () => {
    const { accountPayableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/accounts-payable'],
      {
        restaurantId: 'r-1',
        body: { description: 'Aluguel setembro', issueDate: '2026-09-01', dueDate: '2026-09-10', value: 1500 },
      },
      { json },
    );

    expect(accountPayableRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ description: 'Aluguel setembro', value: 1500 }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
  });

  it('rejeita criação sem descrição', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/accounts-payable'],
        { restaurantId: 'r-1', body: { issueDate: '2026-09-01', dueDate: '2026-09-10', value: 1500 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('REQ-1: PUT /restaurants/me/accounts-payable/:id edita um título existente', async () => {
    const { accountPayableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/accounts-payable/:id'],
      {
        restaurantId: 'r-1',
        params: { id: 'ap-1' },
        body: { description: 'Aluguel outubro', issueDate: '2026-10-01', dueDate: '2026-10-10', value: 1500 },
      },
      { json },
    );

    expect(accountPayableRepository.update).toHaveBeenCalledWith('ap-1', expect.objectContaining({ description: 'Aluguel outubro' }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ description: 'Aluguel outubro' }));
  });

  it('AC-2: PATCH .../pay marca o título como pago com data/valor pagos', async () => {
    const { accountPayableRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-payable/:id/pay'],
      { restaurantId: 'r-1', params: { id: 'ap-1' }, body: { paidValue: 1500, paidAt: '2026-09-09T00:00:00.000Z' } },
      { json },
    );

    expect(accountPayableRepository.markAsPaid).toHaveBeenCalledWith('ap-1', 1500, new Date('2026-09-09T00:00:00.000Z'));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'pago' }));
  });

  // Pedido explícito do usuário — liquidar um título a pagar pode opcionalmente lançar uma saída
  // no Movimento de Caixa, quando há sessão aberta. Default (campo omitido) é `true`.
  it('AC-2: PATCH .../pay sem affectsCashRegister (default true) lança uma saída no caixa aberto', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-payable/:id/pay'],
      { restaurantId: 'r-1', params: { id: 'ap-1' }, body: { paidValue: 1500 } },
      { json },
    );

    expect(cashRegisterRepository.findOpenSessionByRestaurant).toHaveBeenCalledWith('r-1');
    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith(
      'cr-1',
      expect.objectContaining({ type: 'saida', amount: 1500, description: expect.stringContaining('Aluguel setembro') }),
    );
  });

  it('AC-2: PATCH .../pay com affectsCashRegister: false não lança nada no caixa', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-payable/:id/pay'],
      { restaurantId: 'r-1', params: { id: 'ap-1' }, body: { paidValue: 1500, affectsCashRegister: false } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('AC-2: PATCH .../pay com affectsCashRegister: true mas sem sessão de caixa aberta não lança nada (não força abertura)', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/accounts-payable/:id/pay'],
      { restaurantId: 'r-1', params: { id: 'ap-1' }, body: { paidValue: 1500, affectsCashRegister: true } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('lança 404 ao operar sobre um título de outro restaurante', async () => {
    const { routes } = setup({
      accountPayableRepository: { findById: jest.fn().mockResolvedValue(buildAccount({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/accounts-payable/:id/pay'],
        { restaurantId: 'r-1', params: { id: 'ap-1' }, body: { paidValue: 1500 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
