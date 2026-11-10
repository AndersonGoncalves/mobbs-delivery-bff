import type { Request, Response, Server } from 'restify';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { IUberDeliveryConfig } from '../domain/entities/uber-delivery-config.entity';
import { UberDeliveryConfigController } from './uber-delivery-config.controller';

// Mesmo padrão de `asaas-onboarding.controller.spec.ts` — evita depender de `BFF_PUBLIC_BASE_URL`
// estar setada no ambiente de teste pra montar a URL do webhook de forma previsível.
jest.mock('../../../shared/config/environment', () => ({
  environment: { server: { publicBaseUrl: 'https://api.bsdelivery.com.br' } },
}));

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

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildConfig(overrides: Partial<IUberDeliveryConfig> = {}): IUberDeliveryConfig {
  return {
    restaurantId: 'r-1',
    customerId: 'uber-customer-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    originZipCode: '01000000',
    webhookToken: 'webhook-token-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('UberDeliveryConfigController (specs/0121-integracao-uber-entregas REQ-1)', () => {
  function setup(overrides: { uberDeliveryConfigRepository?: Partial<IUberDeliveryConfigRepository> } = {}) {
    const uberDeliveryConfigRepository: Partial<IUberDeliveryConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      upsert: jest.fn().mockResolvedValue(buildConfig()),
      delete: jest.fn().mockResolvedValue(undefined),
      ...overrides.uberDeliveryConfigRepository,
    };
    const { application, routes } = buildApp();
    new UberDeliveryConfigController(uberDeliveryConfigRepository as IUberDeliveryConfigRepository, jest.fn()).initializeRoutes(application);
    return { uberDeliveryConfigRepository, routes };
  }

  it('AC-1: GET devolve a config sem expor clientSecret', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/uber-delivery-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('clientSecret');
    expect(payload).not.toHaveProperty('webhookToken');
    expect(payload).toMatchObject({ connected: true, customerId: 'uber-customer-1', clientId: 'client-1', originZipCode: '01000000' });
  });

  // Achado real (10/11/2026, pedido explícito do usuário) — sem a URL do webhook pronta (com o
  // token embutido), o operador não tinha como cadastrar o webhook no painel da Uber e o teste de
  // despacho ficava incompleto (status nunca atualizava). Diferente de `clientSecret`,
  // `webhookToken` é gerado por nós e o operador precisa dele — só nunca cru, sempre dentro da URL.
  it('achado real (10/11/2026): GET/PUT devolvem a URL do webhook pronta pra colar no painel da Uber', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/uber-delivery-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload.webhookUrl).toBe('https://api.bsdelivery.com.br/webhooks/uber-direct/r-1?token=webhook-token-1');
  });

  it('GET sem config cadastrada devolve connected: false', async () => {
    const { routes } = setup({ uberDeliveryConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/uber-delivery-config'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, { connected: false });
  });

  it('AC-1: PUT salva credenciais e CEP de origem', async () => {
    const { uberDeliveryConfigRepository, routes } = setup();

    await runOperatorChain(
      routes['PUT /restaurants/me/uber-delivery-config'],
      { restaurantId: 'r-1', body: { customerId: 'uber-customer-2', clientId: 'client-2', clientSecret: 'secret-2', originZipCode: '09999000' } },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(uberDeliveryConfigRepository.upsert).toHaveBeenCalledWith('r-1', {
      customerId: 'uber-customer-2',
      clientId: 'client-2',
      clientSecret: 'secret-2',
      originZipCode: '09999000',
    });
  });

  it('PUT rejeita CEP fora do formato de 8 dígitos', async () => {
    const { uberDeliveryConfigRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/uber-delivery-config'],
        { restaurantId: 'r-1', body: { customerId: 'c', clientId: 'c', clientSecret: 's', originZipCode: '123' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toThrow();
    expect(uberDeliveryConfigRepository.upsert).not.toHaveBeenCalled();
  });

  it('DEL remove a configuração', async () => {
    const { uberDeliveryConfigRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/uber-delivery-config'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(uberDeliveryConfigRepository.delete).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
