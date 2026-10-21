import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { MercadoPagoClient } from '../infra/mercado-pago-client';
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller';

jest.mock('../infra/mercado-pago-client');
jest.mock('../../../shared/config/environment', () => ({
  environment: {
    mercadoPago: { clientId: 'app-client-id', clientSecret: 'app-client-secret', redirectUri: 'https://bsdelivery.com.br/painel/mercadopago/callback', baseUrl: 'https://api.mercadopago.com' },
  },
}));

type FakeRequest = Partial<Pick<Request, 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
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

    expect(MockedMercadoPagoClient.prototype.exchangeCodeForToken).toHaveBeenCalledWith('code-1', 'https://bsdelivery.com.br/painel/mercadopago/callback');
  });

  it('payload inválido (sem code) é rejeitado antes de chamar o Mercado Pago', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/mercadopago/callback'], { restaurantId: 'r-1', body: {} }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(MockedMercadoPagoClient.prototype.exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
