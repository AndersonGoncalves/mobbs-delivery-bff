import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { KeetaAuthService } from '../infra/keeta-auth.service';
import { KeetaOnboardingController } from './keeta-onboarding.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

describe('KeetaOnboardingController (specs/0212-integracao-keeta REQ-1/REQ-2)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    keetaAuthService?: Partial<KeetaAuthService>;
    appConfigured?: boolean;
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      markKeetaAuthorizationPending: jest.fn().mockResolvedValue({ id: 'r-1' }),
      disconnectKeeta: jest.fn().mockResolvedValue({ id: 'r-1' }),
      ...overrides.restaurantRepository,
    };
    const keetaAuthService: Partial<KeetaAuthService> = {
      buildAuthorizationUrl: jest.fn().mockReturnValue({ url: 'https://merchant.mykeeta.com/m/web/openapi/authorize?x=1', state: 'nonce-1' }),
      ...overrides.keetaAuthService,
    };
    const { application, routes } = buildApp();
    new KeetaOnboardingController(
      restaurantRepository as IRestaurantRepository,
      keetaAuthService as KeetaAuthService,
      jest.fn(),
      overrides.appConfigured ?? true,
    ).initializeRoutes(application);
    return { restaurantRepository, keetaAuthService, routes };
  }

  it('AC-1: gera o link de autorização e marca o restaurante como pendente com o state', async () => {
    const { restaurantRepository, keetaAuthService, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/keeta/authorize-link'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(keetaAuthService.buildAuthorizationUrl).toHaveBeenCalled();
    expect(restaurantRepository.markKeetaAuthorizationPending).toHaveBeenCalledWith('r-1', 'nonce-1');
    expect(json).toHaveBeenCalledWith(200, { url: 'https://merchant.mykeeta.com/m/web/openapi/authorize?x=1' });
  });

  it('sem appId/appSecret/redirectUri configurados (credencial de plataforma ainda não existe), rejeita', async () => {
    const { keetaAuthService, routes } = setup({ appConfigured: false });

    await expect(
      runOperatorChain(routes['POST /restaurants/me/keeta/authorize-link'], { restaurantId: 'r-1' }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
    expect(keetaAuthService.buildAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('desvincula a integração', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/keeta/credentials'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.disconnectKeeta).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
