import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReseller } from '../domain/entities/reseller.entity';
import { IResellerClient } from '../domain/entities/reseller-client.entity';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { PlatformResellersController } from './platform-resellers.controller';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), post: register('POST'), patch: register('PATCH') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` + `platformAdminMiddleware`.
async function runChain(handlers: RouteHandler[], req: Partial<Request>, res: Partial<Response>): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req as Request, res as Response);
  }
}

function buildReseller(overrides: Partial<IReseller> = {}): IReseller {
  return { id: 'reseller-1', name: 'Ana Revendedora', email: 'ana@revenda.com', phone: '11999999999', code: 'ABC123', isActive: true, createdAt: new Date('2026-10-01'), ...overrides };
}

function buildClient(overrides: Partial<IResellerClient> = {}): IResellerClient {
  return { id: 'client-1', resellerId: 'reseller-1', restaurantId: 'r-1', origin: 'link', createdAt: new Date('2026-10-03'), ...overrides };
}

describe('PlatformResellersController (specs/0189-painel-revenda)', () => {
  function setup(overrides: {
    reseller?: Partial<IResellerRepository>;
    prospect?: Partial<IResellerProspectRepository>;
    client?: Partial<IResellerClientRepository>;
    restaurant?: Partial<IRestaurantRepository>;
  } = {}) {
    const resellerRepository = {
      listAll: jest.fn().mockResolvedValue([buildReseller()]),
      findById: jest.fn().mockResolvedValue(buildReseller()),
      findByCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(buildReseller()),
      setActive: jest.fn().mockResolvedValue(buildReseller({ isActive: false })),
      ...overrides.reseller,
    } as unknown as IResellerRepository;
    const prospectRepository = { listByReseller: jest.fn().mockResolvedValue([]), ...overrides.prospect } as unknown as IResellerProspectRepository;
    const clientRepository = {
      listByReseller: jest.fn().mockResolvedValue([]),
      countByReseller: jest.fn().mockResolvedValue(0),
      ...overrides.client,
    } as unknown as IResellerClientRepository;
    const restaurantRepository = { findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Pizzaria do João' }), ...overrides.restaurant } as unknown as IRestaurantRepository;
    const { application, routes } = buildFakeApplication();
    new PlatformResellersController(resellerRepository, prospectRepository, clientRepository, restaurantRepository, jest.fn()).initializeRoutes(application);
    return { resellerRepository, prospectRepository, clientRepository, restaurantRepository, routes };
  }

  // AC-8/REQ-13.
  it('AC-8: GET /platform/resellers devolve nome/e-mail/status/contagens de cada revendedor', async () => {
    const { routes } = setup({
      prospect: { listByReseller: jest.fn().mockResolvedValue([{}, {}]) },
      client: { countByReseller: jest.fn().mockResolvedValue(3) },
    });
    const json = jest.fn();

    await runChain(routes['GET /platform/resellers'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({
      name: 'Ana Revendedora', email: 'ana@revenda.com', isActive: true, prospectsCount: 2, clientsCount: 3,
    })]);
  });

  // AC-1/REQ-2.
  it('AC-1: POST /platform/resellers cria o revendedor com um código único gerado', async () => {
    const { resellerRepository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['POST /platform/resellers'],
      { body: { name: 'Ana Revendedora', email: 'ana@revenda.com', phone: '11999999999' } },
      { json },
    );

    expect(resellerRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ana Revendedora', email: 'ana@revenda.com', phone: '11999999999', code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/),
    }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'Ana Revendedora' }));
  });

  // AC-8/REQ-14.
  it('AC-8: GET /platform/resellers/:id devolve o revendedor, os prospects e os clientes efetivados completos', async () => {
    const { routes } = setup({ client: { listByReseller: jest.fn().mockResolvedValue([buildClient()]) } });
    const json = jest.fn();

    await runChain(routes['GET /platform/resellers/:id'], { params: { id: 'reseller-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      reseller: expect.objectContaining({ id: 'reseller-1' }),
      clients: [expect.objectContaining({ restaurantId: 'r-1', restaurantName: 'Pizzaria do João' })],
    }));
  });

  // AC-9/REQ-16.
  it('AC-9: PATCH /platform/resellers/:id/active inativa o revendedor', async () => {
    const { resellerRepository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['PATCH /platform/resellers/:id/active'], { params: { id: 'reseller-1' }, body: { isActive: false } }, { json });

    expect(resellerRepository.setActive).toHaveBeenCalledWith('reseller-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });
});
