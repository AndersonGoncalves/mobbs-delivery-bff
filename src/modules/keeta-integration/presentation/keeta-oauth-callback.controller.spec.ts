import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { KeetaAuthService } from '../infra/keeta-auth.service';
import { KeetaOAuthCallbackController } from './keeta-oauth-callback.controller';

type FakeRequest = Partial<Pick<Request, 'query'>>;
type FakeResponse = Pick<Response, 'header' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return { id: 'restaurant-1', name: 'Restaurante 1', ...overrides };
}

describe('KeetaOAuthCallbackController (specs/0212-integracao-keeta REQ-1/REQ-2)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    keetaAuthService?: Partial<KeetaAuthService>;
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByKeetaAuthorizationState: jest.fn().mockResolvedValue(buildRestaurant()),
      saveKeetaBinding: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const keetaAuthService: Partial<KeetaAuthService> = {
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'ref-1', tokenExpiresAt: '2027-02-17T00:00:00.000Z' }),
      getAuthorizedShops: jest.fn().mockResolvedValue({ brandId: 'brand-1', shops: [{ id: 'shop-1', name: 'Loja Centro' }] }),
      ...overrides.keetaAuthService,
    };
    const { application, routes } = buildApp();
    new KeetaOAuthCallbackController(
      restaurantRepository as IRestaurantRepository,
      keetaAuthService as KeetaAuthService,
      'https://bsdelivery.com.br',
    ).initializeRoutes(application);
    return { restaurantRepository, keetaAuthService, routes };
  }

  async function get(routes: Record<string, RouteHandler[]>, query: Record<string, string>, res: FakeResponse) {
    const handler = routes['GET /webhooks/keeta/oauth-callback'][1]; // [webhookRateLimitMiddleware, handler]
    await handler({ query }, res);
  }

  it('AC-1: troca o code por token, persiste o vínculo e redireciona com connected=1', async () => {
    const { routes, restaurantRepository, keetaAuthService } = setup();
    const header = jest.fn();
    const send = jest.fn();

    await get(routes, { code: 'code-xyz', state: 'state-1' }, { header, send });

    expect(restaurantRepository.findByKeetaAuthorizationState).toHaveBeenCalledWith('state-1');
    expect(keetaAuthService.exchangeAuthorizationCode).toHaveBeenCalledWith('code-xyz');
    expect(restaurantRepository.saveKeetaBinding).toHaveBeenCalledWith('restaurant-1', {
      shopId: 'shop-1',
      brandId: 'brand-1',
      accessToken: 'tok-1',
      refreshToken: 'ref-1',
      tokenExpiresAt: '2027-02-17T00:00:00.000Z',
    });
    expect(header).toHaveBeenCalledWith('Location', 'https://bsdelivery.com.br/painel/settings/keeta?connected=1');
    expect(send).toHaveBeenCalledWith(302);
  });

  it('state desconhecido/expirado: redireciona com connected=0 sem trocar o code', async () => {
    const { routes, keetaAuthService } = setup({ restaurantRepository: { findByKeetaAuthorizationState: jest.fn().mockResolvedValue(null) } });
    const header = jest.fn();

    await get(routes, { code: 'code-xyz', state: 'state-desconhecido' }, { header, send: jest.fn() });

    expect(keetaAuthService.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(header).toHaveBeenCalledWith('Location', 'https://bsdelivery.com.br/painel/settings/keeta?connected=0');
  });

  it('sem code/state na query: redireciona com connected=0', async () => {
    const { routes } = setup();
    const header = jest.fn();

    await get(routes, {}, { header, send: jest.fn() });

    expect(header).toHaveBeenCalledWith('Location', 'https://bsdelivery.com.br/painel/settings/keeta?connected=0');
  });

  it('nenhuma loja autorizada: redireciona com connected=0 sem salvar vínculo', async () => {
    const { routes, restaurantRepository } = setup({ keetaAuthService: { getAuthorizedShops: jest.fn().mockResolvedValue({ shops: [] }) } });
    const header = jest.fn();

    await get(routes, { code: 'code-xyz', state: 'state-1' }, { header, send: jest.fn() });

    expect(restaurantRepository.saveKeetaBinding).not.toHaveBeenCalled();
    expect(header).toHaveBeenCalledWith('Location', 'https://bsdelivery.com.br/painel/settings/keeta?connected=0');
  });
});
