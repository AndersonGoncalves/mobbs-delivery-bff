import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReseller } from '../domain/entities/reseller.entity';
import { IResellerProspect } from '../domain/entities/reseller-prospect.entity';
import { IResellerClient } from '../domain/entities/reseller-client.entity';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { ResellerController } from './reseller.controller';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), post: register('POST'), patch: register('PATCH'), del: register('DEL') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` + `resellerMiddleware` (1º e 2º da chain); aqui o foco é o
// handler de negócio a partir de `req.resellerId` já resolvido.
async function runChain(handlers: RouteHandler[], req: Partial<Request>, res: Partial<Response>): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req as Request, res as Response);
  }
}

function buildReseller(overrides: Partial<IReseller> = {}): IReseller {
  return { id: 'reseller-1', name: 'Ana Revendedora', email: 'ana@revenda.com', phone: '11999999999', code: 'ABC123', isActive: true, createdAt: new Date('2026-10-01'), ...overrides };
}

function buildProspect(overrides: Partial<IResellerProspect> = {}): IResellerProspect {
  return { id: 'prospect-1', resellerId: 'reseller-1', establishmentName: 'Pizzaria do João', status: 'em_prospeccao', createdAt: new Date('2026-10-02'), ...overrides };
}

function buildClient(overrides: Partial<IResellerClient> = {}): IResellerClient {
  return { id: 'client-1', resellerId: 'reseller-1', restaurantId: 'r-1', origin: 'link', createdAt: new Date('2026-10-03'), ...overrides };
}

describe('ResellerController (specs/0189-painel-revenda)', () => {
  function setup(overrides: {
    reseller?: Partial<IResellerRepository>;
    prospect?: Partial<IResellerProspectRepository>;
    client?: Partial<IResellerClientRepository>;
    restaurant?: Partial<IRestaurantRepository>;
  } = {}) {
    const resellerRepository = { findById: jest.fn().mockResolvedValue(buildReseller()), ...overrides.reseller } as unknown as IResellerRepository;
    const prospectRepository = {
      listByReseller: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(buildProspect()),
      update: jest.fn().mockResolvedValue(buildProspect()),
      delete: jest.fn().mockResolvedValue(true),
      markConverted: jest.fn().mockResolvedValue(buildProspect({ status: 'convertido', convertedRestaurantId: 'r-1' })),
      ...overrides.prospect,
    } as unknown as IResellerProspectRepository;
    const clientRepository = {
      listByReseller: jest.fn().mockResolvedValue([]),
      findByRestaurantId: jest.fn().mockResolvedValue(null),
      listClaimedRestaurantIds: jest.fn().mockResolvedValue(new Set()),
      create: jest.fn().mockResolvedValue(buildClient()),
      ...overrides.client,
    } as unknown as IResellerClientRepository;
    const restaurantRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Pizzaria do João' }),
      listAll: jest.fn().mockResolvedValue([{ id: 'r-1', name: 'Pizzaria do João' }, { id: 'r-2', name: 'Hamburgueria do Zé' }]),
      ...overrides.restaurant,
    } as unknown as IRestaurantRepository;
    const { application, routes } = buildFakeApplication();
    new ResellerController(resellerRepository, prospectRepository, clientRepository, restaurantRepository, jest.fn()).initializeRoutes(application);
    return { resellerRepository, prospectRepository, clientRepository, restaurantRepository, routes };
  }

  // REQ-9.
  it('GET /reseller/me devolve os dados do revendedor com o link de indicação pronto', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /reseller/me'], { resellerId: 'reseller-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      code: 'ABC123',
      referralLink: 'https://bsdelivery.com.br/gratis?revenda=ABC123',
    }));
  });

  // AC-4.
  it('AC-4: POST /reseller/me/prospects cria o prospect vinculado ao revendedor logado', async () => {
    const { prospectRepository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['POST /reseller/me/prospects'],
      { resellerId: 'reseller-1', body: { establishmentName: 'Pizzaria do João' } },
      { json },
    );

    expect(prospectRepository.create).toHaveBeenCalledWith({ resellerId: 'reseller-1', establishmentName: 'Pizzaria do João' });
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'em_prospeccao' }));
  });

  // plan.md decisão 2 — editar um prospect já convertido falha (404), não sobrescreve o histórico.
  it('plan.md decisão 2: editar um prospect já convertido falha com 404', async () => {
    const { prospectRepository, routes } = setup({ prospect: { update: jest.fn().mockResolvedValue(null) } });

    await expect(runChain(
      routes['PATCH /reseller/me/prospects/:id'],
      { resellerId: 'reseller-1', params: { id: 'prospect-1' }, body: { establishmentName: 'Novo nome' } },
      { json: jest.fn() },
    )).rejects.toThrow();
    expect(prospectRepository.update).toHaveBeenCalledWith('prospect-1', 'reseller-1', { establishmentName: 'Novo nome' });
  });

  // AC-5.
  it('AC-5: PATCH .../convert marca o prospect como convertido e cria o cliente efetivado com origem "manual"', async () => {
    const { prospectRepository, clientRepository, routes } = setup({
      client: { create: jest.fn().mockResolvedValue(buildClient({ origin: 'manual' })) },
    });
    const json = jest.fn();

    await runChain(
      routes['PATCH /reseller/me/prospects/:id/convert'],
      { resellerId: 'reseller-1', params: { id: 'prospect-1' }, body: { restaurantId: 'r-1' } },
      { json },
    );

    expect(prospectRepository.markConverted).toHaveBeenCalledWith('prospect-1', 'reseller-1', 'r-1');
    expect(clientRepository.create).toHaveBeenCalledWith({ resellerId: 'reseller-1', restaurantId: 'r-1', origin: 'manual' });
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      prospect: expect.objectContaining({ status: 'convertido' }),
      client: expect.objectContaining({ origin: 'manual' }),
    }));
  });

  // plan.md decisão 3 — restaurante já reclamado por outro revendedor: 409, nada é criado.
  it('plan.md decisão 3: converter pra um restaurante já cliente de outro revendedor falha com 409, sem criar nada', async () => {
    const { prospectRepository, clientRepository, routes } = setup({
      client: { findByRestaurantId: jest.fn().mockResolvedValue(buildClient({ resellerId: 'outro-revendedor' })) },
    });

    await expect(runChain(
      routes['PATCH /reseller/me/prospects/:id/convert'],
      { resellerId: 'reseller-1', params: { id: 'prospect-1' }, body: { restaurantId: 'r-1' } },
      { json: jest.fn() },
    )).rejects.toThrow();
    expect(prospectRepository.markConverted).not.toHaveBeenCalled();
    expect(clientRepository.create).not.toHaveBeenCalled();
  });

  // REQ-8 — restaurante já reclamado não aparece na lista de conversão.
  it('REQ-8: GET .../convertible-restaurants exclui restaurantes já reclamados por qualquer revendedor', async () => {
    const { routes } = setup({ client: { listClaimedRestaurantIds: jest.fn().mockResolvedValue(new Set(['r-1'])) } });
    const json = jest.fn();

    await runChain(routes['GET /reseller/me/convertible-restaurants'], { resellerId: 'reseller-1', query: {} }, { json });

    expect(json).toHaveBeenCalledWith(200, [{ id: 'r-2', name: 'Hamburgueria do Zé' }]);
  });

  // REQ-7 — lista de clientes efetivados com o nome do restaurante resolvido.
  it('REQ-7: GET /reseller/me/clients resolve o nome do restaurante de cada vínculo', async () => {
    const { routes } = setup({ client: { listByReseller: jest.fn().mockResolvedValue([buildClient()]) } });
    const json = jest.fn();

    await runChain(routes['GET /reseller/me/clients'], { resellerId: 'reseller-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ restaurantId: 'r-1', restaurantName: 'Pizzaria do João', origin: 'link' })]);
  });
});
