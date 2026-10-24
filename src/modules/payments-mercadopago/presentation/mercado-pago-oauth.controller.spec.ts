import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { MercadoPagoClient } from '../infra/mercado-pago-client';
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller';
import { environment } from '../../../shared/config/environment';

jest.mock('../infra/mercado-pago-client');
jest.mock('../../../shared/config/environment', () => ({
  environment: {
    mercadoPago: { clientId: '123456', clientSecret: 'app-client-secret', redirectUri: 'https://bsdelivery.com.br/painel/settings/mercadopago/callback', baseUrl: 'https://api.mercadopago.com' },
  },
}));

type FakeRequest = Partial<Pick<Request, 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

describe('MercadoPagoOAuthController (specs/0170-integracao-mercado-pago)', () => {
  const MockedMercadoPagoClient = MercadoPagoClient as jest.MockedClass<typeof MercadoPagoClient>;

  beforeEach(() => {
    MockedMercadoPagoClient.mockClear();
    MockedMercadoPagoClient.prototype.exchangeCodeForToken = jest.fn().mockResolvedValue({ accessToken: 'token-1', refreshToken: 'refresh-1', userId: '123', expiresIn: 15552000 });
  });
  afterEach(() => jest.restoreAllMocks());

  function setup(overrides: { restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      saveMercadoPagoTokens: jest.fn().mockResolvedValue({ id: 'r-1', mercadoPagoUserId: '123' }),
      ...overrides.restaurantRepository,
    };
    const { application, routes } = buildApp();
    new MercadoPagoOAuthController(restaurantRepository as IRestaurantRepository, jest.fn()).initializeRoutes(application);
    return { restaurantRepository, routes };
  }

  it('AC-1: operador dono/gerente troca o code por tokens e persiste sem expor access_token/refresh_token', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { restaurantId: 'r-1', body: { code: 'code-1' } }, { json, send: jest.fn() });

    expect(restaurantRepository.saveMercadoPagoTokens).toHaveBeenCalledWith('r-1', {
      mercadoPagoAccessToken: 'token-1',
      mercadoPagoRefreshToken: 'refresh-1',
      mercadoPagoUserId: '123',
      mercadoPagoTokenExpiresAt: expect.any(String),
    });
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('mercadoPagoAccessToken');
    expect(payload).not.toHaveProperty('mercadoPagoRefreshToken');
    expect(payload).toMatchObject({ mercadoPagoLinked: true, mercadoPagoUserId: '123' });
  });

  it('troca o code usando o redirectUri configurado', async () => {
    const { routes } = setup();

    await runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { restaurantId: 'r-1', body: { code: 'code-1' } }, { json: jest.fn(), send: jest.fn() });

    expect(MockedMercadoPagoClient.prototype.exchangeCodeForToken).toHaveBeenCalledWith('code-1', 'https://bsdelivery.com.br/painel/settings/mercadopago/callback', undefined);
  });

  it('0180: configuração pública vem do BFF sem expor segredos', async () => {
    const { routes } = setup();
    const json = jest.fn();
    await runOperatorChain(routes['GET /restaurants/me/mercadopago/config'], {}, { json, send: jest.fn() });
    expect(json).toHaveBeenCalledWith(200, {
      configured: true, clientId: '123456', redirectUri: 'https://bsdelivery.com.br/painel/settings/mercadopago/callback',
      missing: [], paymentMissing: ['MERCADOPAGO_WEBHOOK_SECRET', 'MERCADOPAGO_PLATFORM_ACCESS_TOKEN'],
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('app-client-secret');
  });

  it('0180: informa configuração ausente/inválida e impede troca', async () => {
    jest.replaceProperty(environment.mercadoPago, 'clientId', '');
    const { routes } = setup();
    const json = jest.fn();
    await runOperatorChain(routes['GET /restaurants/me/mercadopago/config'], {}, { json, send: jest.fn() });
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      configured: false, missing: ['MERCADOPAGO_CLIENT_ID (Application ID numérico)'],
    }));
    await expect(runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { body: { code: 'code' } }, { json, send: jest.fn() }))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it.each(['http://bsdelivery.com.br/painel/settings/mercadopago/callback', 'https://bsdelivery.com.br/painel/mercadopago/callback', 'not-url'])('0180: rejeita callback incorreto %s', async (redirectUri) => {
    jest.replaceProperty(environment.mercadoPago, 'redirectUri', redirectUri);
    const { routes } = setup();
    const json = jest.fn();
    await runOperatorChain(routes['GET /restaurants/me/mercadopago/config'], {}, { json, send: jest.fn() });
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ configured: false, missing: ['MERCADOPAGO_REDIRECT_URI (URL HTTPS de callback)'] }));
  });

  it('0180: encaminha verifier PKCE à troca e rejeita verifier inválido', async () => {
    const { routes } = setup();
    const codeVerifier = 'v'.repeat(64);
    await runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { restaurantId: 'r1', body: { code: 'code-1', codeVerifier } }, { json: jest.fn(), send: jest.fn() });
    expect(MockedMercadoPagoClient.prototype.exchangeCodeForToken).toHaveBeenCalledWith('code-1', environment.mercadoPago.redirectUri, codeVerifier);
    await expect(runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { body: { code: 'code', codeVerifier: 'short' } }, { json: jest.fn(), send: jest.fn() }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('payload inválido (sem code) é rejeitado antes de chamar o Mercado Pago', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { restaurantId: 'r-1', body: {} }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(MockedMercadoPagoClient.prototype.exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
