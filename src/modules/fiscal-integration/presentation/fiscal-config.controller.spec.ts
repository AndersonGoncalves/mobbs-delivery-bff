import type { Request, Response, Server } from 'restify';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { IFiscalConfig } from '../domain/entities/fiscal-config.entity';
import { FiscalConfigController } from './fiscal-config.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildConfig(overrides: Partial<IFiscalConfig> = {}): IFiscalConfig {
  return {
    restaurantId: 'r-1',
    focusNfeToken: 'token-1',
    environment: 'homologacao',
    documentType: 'nfce',
    productionEnabled: false,
    autoEmitEnabled: true,
    webhookToken: 'webhook-token-1',
    cnpj: '11222333000181',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FiscalConfigController (specs/0091-integracao-fiscal-focusnfe REQ-1)', () => {
  function setup(overrides: { fiscalConfigRepository?: Partial<IFiscalConfigRepository> } = {}) {
    const fiscalConfigRepository: Partial<IFiscalConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      upsert: jest.fn().mockResolvedValue(buildConfig()),
      setProductionEnabled: jest.fn().mockResolvedValue(buildConfig({ productionEnabled: true })),
      setAutoEmitEnabled: jest.fn().mockResolvedValue(buildConfig({ autoEmitEnabled: false })),
      delete: jest.fn().mockResolvedValue(undefined),
      ...overrides.fiscalConfigRepository,
    };
    const { application, routes } = buildApp();
    new FiscalConfigController(fiscalConfigRepository as IFiscalConfigRepository, jest.fn()).initializeRoutes(application);
    return { fiscalConfigRepository, routes };
  }

  it('AC-1: GET devolve a config sem expor token/webhookToken', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/fiscal-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('focusNfeToken');
    expect(payload).not.toHaveProperty('webhookToken');
    expect(payload).toMatchObject({ connected: true, environment: 'homologacao', documentType: 'nfce', cnpj: '11222333000181' });
  });

  // specs/0203-pendencias-fiscais-entregues-fechados AC-1 — necessário pro frontend não marcar
  // como "pendência fiscal" um pedido entregue antes da integração fiscal existir.
  it('AC-1 (0203): GET devolve createdAt da configuração', async () => {
    const createdAt = '2026-09-01T12:00:00.000Z';
    const { routes } = setup({ fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ createdAt })) } });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/fiscal-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload.createdAt).toBe(createdAt);
  });

  // specs/0204-controle-emissao-fiscal-automatica AC-5.
  it('AC-5 (0204): GET devolve autoEmitEnabled da configuração', async () => {
    const { routes } = setup({ fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ autoEmitEnabled: false })) } });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/fiscal-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload.autoEmitEnabled).toBe(false);
  });

  it('GET sem config cadastrada devolve connected: false', async () => {
    const { routes } = setup({ fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/fiscal-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, { connected: false });
  });

  it('AC-1: PUT salva token/ambiente/documento/CNPJ', async () => {
    const { fiscalConfigRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/fiscal-config'],
      { restaurantId: 'r-1', body: { focusNfeToken: 'token-2', environment: 'producao', documentType: 'nfce', cnpj: '11222333000181' } },
      { json, send: jest.fn() },
    );

    expect(fiscalConfigRepository.upsert).toHaveBeenCalledWith('r-1', {
      focusNfeToken: 'token-2',
      environment: 'producao',
      documentType: 'nfce',
      cnpj: '11222333000181',
    });
  });

  it('PUT .../production liga o botão de produção separadamente', async () => {
    const { fiscalConfigRepository, routes } = setup();

    await runOperatorChain(
      routes['PUT /restaurants/me/fiscal-config/production'],
      { restaurantId: 'r-1', body: { productionEnabled: true } },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(fiscalConfigRepository.setProductionEnabled).toHaveBeenCalledWith('r-1', true);
  });

  // specs/0204-controle-emissao-fiscal-automatica AC-4/AC-7.
  it('AC-4 (0204): PUT .../auto-emit muda só autoEmitEnabled, preservando o resto da config', async () => {
    const { fiscalConfigRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/fiscal-config/auto-emit'],
      { restaurantId: 'r-1', body: { autoEmitEnabled: false } },
      { json, send: jest.fn() },
    );

    expect(fiscalConfigRepository.setAutoEmitEnabled).toHaveBeenCalledWith('r-1', false);
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ autoEmitEnabled: false, environment: 'homologacao', documentType: 'nfce', cnpj: '11222333000181' });
  });

  // AC-7: mesma proteção requireOperatorRole('dono', 'gerente') de todas as outras rotas desta
  // controller — a cadeia inteira é montada em initializeRoutes, então basta confirmar que a
  // rota nova também carrega os 3 middlewares (firebaseAuthMiddleware, restaurantOperatorMiddleware,
  // requireOperatorRole), mesmo critério já coberto indiretamente pelas demais rotas.
  it('AC-7 (0204): PUT .../auto-emit é protegida pela mesma cadeia operatorAuthenticated das demais rotas', async () => {
    const { routes } = setup();

    expect(routes['PUT /restaurants/me/fiscal-config/auto-emit']).toHaveLength(4);
  });

  it('DEL remove a configuração fiscal', async () => {
    const { fiscalConfigRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/fiscal-config'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(fiscalConfigRepository.delete).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
