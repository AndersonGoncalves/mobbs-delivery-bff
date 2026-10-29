import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodAuthService } from '../infra/ninety-nine-food-auth.service';
import { NinetyNineFoodOnboardingController } from './ninety-nine-food-onboarding.controller';

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

describe('NinetyNineFoodOnboardingController (specs/0122-integracao-99food REQ-1/REQ-2)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    ninetyNineFoodAuthService?: Partial<NinetyNineFoodAuthService>;
    appConfigured?: boolean;
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      markNinetyNineFoodAuthorizationPending: jest.fn().mockResolvedValue({ id: 'r-1' }),
      disconnectNinetyNineFood: jest.fn().mockResolvedValue({ id: 'r-1' }),
      ...overrides.restaurantRepository,
    };
    const ninetyNineFoodAuthService: Partial<NinetyNineFoodAuthService> = {
      getAuthorizationUrl: jest.fn().mockResolvedValue('https://merchant.99app.com/authorize?x=1'),
      ...overrides.ninetyNineFoodAuthService,
    };
    const { application, routes } = buildApp();
    new NinetyNineFoodOnboardingController(
      restaurantRepository as IRestaurantRepository,
      ninetyNineFoodAuthService as NinetyNineFoodAuthService,
      jest.fn(),
      overrides.appConfigured ?? true,
    ).initializeRoutes(application);
    return { restaurantRepository, ninetyNineFoodAuthService, routes };
  }

  it('AC-1: gera o link de autorização e marca o restaurante como pendente', async () => {
    const { restaurantRepository, ninetyNineFoodAuthService, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/99food/authorize-link'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(ninetyNineFoodAuthService.getAuthorizationUrl).toHaveBeenCalled();
    expect(restaurantRepository.markNinetyNineFoodAuthorizationPending).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { url: 'https://merchant.99app.com/authorize?x=1' });
  });

  it('sem app_id/app_secret configurados (credencial de plataforma ainda não existe), rejeita', async () => {
    const { ninetyNineFoodAuthService, routes } = setup({ appConfigured: false });

    await expect(
      runOperatorChain(routes['POST /restaurants/me/99food/authorize-link'], { restaurantId: 'r-1' }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
    expect(ninetyNineFoodAuthService.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('desvincula a integração', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/99food/credentials'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.disconnectNinetyNineFood).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
