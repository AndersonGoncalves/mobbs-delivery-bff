import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IFoodOnboardingController } from './ifood-onboarding.controller';

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

describe('IFoodOnboardingController (specs/0090-integracao-ifood REQ-9)', () => {
  function setup(overrides: { restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      saveIFoodCredentials: jest.fn().mockResolvedValue({ id: 'r-1', ifoodMerchantId: 'merchant-1' }),
      disconnectIFood: jest.fn().mockResolvedValue({ id: 'r-1' }),
      ...overrides.restaurantRepository,
    };
    const { application, routes } = buildApp();
    new IFoodOnboardingController(restaurantRepository as IRestaurantRepository, jest.fn()).initializeRoutes(application);
    return { restaurantRepository, routes };
  }

  it('AC-6: dono/gerente cadastra as credenciais e recebe status conectado, sem expor o clientSecret', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/ifood/credentials'],
      { restaurantId: 'r-1', body: { ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' } },
      { json, send: jest.fn() },
    );

    expect(restaurantRepository.saveIFoodCredentials).toHaveBeenCalledWith('r-1', {
      ifoodMerchantId: 'merchant-1',
      ifoodClientId: 'client-1',
      ifoodClientSecret: 'secret-1',
    });
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('ifoodClientSecret');
    expect(payload).toMatchObject({ connected: true });
  });

  it('rejeita corpo sem os 3 campos obrigatórios', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/ifood/credentials'], { restaurantId: 'r-1', body: { ifoodMerchantId: 'merchant-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
  });

  it('desvincula a integração', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/ifood/credentials'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.disconnectIFood).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
