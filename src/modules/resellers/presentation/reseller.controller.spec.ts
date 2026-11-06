import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReseller } from '../domain/entities/reseller.entity';
import { IResellerProspect } from '../domain/entities/reseller-prospect.entity';
import { IResellerClient } from '../domain/entities/reseller-client.entity';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { IResellerCommissionRepository } from '../domain/repositories/reseller-commission.repository.interface';
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
    commission?: Partial<IResellerCommissionRepository>;
  } = {}) {
    const resellerRepository = {
      findById: jest.fn().mockResolvedValue(buildReseller()),
      updatePixKey: jest.fn().mockResolvedValue(buildReseller({ pixKey: 'ana@pix.com' })),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(buildReseller()),
      ...overrides.reseller,
    } as unknown as IResellerRepository;
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
    const commissionRepository = {
      listByReseller: jest.fn().mockResolvedValue([]),
      ...overrides.commission,
    } as unknown as IResellerCommissionRepository;
    const { application, routes } = buildFakeApplication();
    new ResellerController(resellerRepository, prospectRepository, clientRepository, restaurantRepository, commissionRepository, jest.fn()).initializeRoutes(application);
    return { resellerRepository, prospectRepository, clientRepository, restaurantRepository, commissionRepository, routes };
  }

  // Ajuste explícito do usuário (02/11/2026) — autocadastro público (`/revenda/cadastro`): só
  // `firebaseAuthMiddleware` nesta rota (handlers[0]), nunca `resellerMiddleware` (exigiria um
  // Reseller já existente); por isso roda direto o handler (handlers[1]), sem `runChain`.
  describe('POST /reseller/signup', () => {
    it('cria o revendedor ativo na hora, com o e-mail do token Firebase (nunca do corpo)', async () => {
      const { resellerRepository, routes } = setup({
        reseller: { create: jest.fn().mockResolvedValue(buildReseller({ email: 'nova@revenda.com', code: 'XYZ789' })) },
      });
      const json = jest.fn();
      const handler = routes['POST /reseller/signup'][1];

      await handler(
        { user: { uid: 'u-1', email: 'nova@revenda.com' }, body: { name: 'Nova Revendedora', phone: '11988887777', email: 'tentativa-diferente@evil.com', contractAccepted: true } } as unknown as Request,
        { json } as unknown as Response,
      );

      // `code` é gerado aleatoriamente (`generateUniqueResellerCode`) — confere só os campos que
      // vêm da requisição, nunca o `email` do corpo (sempre o do token). specs/0205 REQ-17 — grava
      // a data do aceite do contrato (`contractAcceptedAt`), não o booleano recebido.
      expect(resellerRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Nova Revendedora', email: 'nova@revenda.com', phone: '11988887777', contractAcceptedAt: expect.any(Date),
      }));
      expect(json).toHaveBeenCalledWith(201, expect.objectContaining({
        email: 'nova@revenda.com',
        referralLink: 'https://bsdelivery.com.br/gratis?revenda=XYZ789',
      }));
    });

    it('recusa cadastrar de novo um e-mail que já é revendedor', async () => {
      const { resellerRepository, routes } = setup({
        reseller: { findByEmail: jest.fn().mockResolvedValue(buildReseller({ email: 'ana@revenda.com' })) },
      });
      const handler = routes['POST /reseller/signup'][1];

      await expect(
        handler(
          { user: { uid: 'u-1', email: 'ana@revenda.com' }, body: { name: 'Ana', phone: '11999999999', contractAccepted: true } } as unknown as Request,
          { json: jest.fn() } as unknown as Response,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(resellerRepository.create).not.toHaveBeenCalled();
    });

    // specs/0205-comissao-revendedor REQ-18 — validação de servidor, nunca confia só na UI.
    it('recusa o cadastro sem o aceite explícito do contrato', async () => {
      const { resellerRepository, routes } = setup();
      const handler = routes['POST /reseller/signup'][1];

      await expect(
        handler(
          { user: { uid: 'u-1', email: 'nova@revenda.com' }, body: { name: 'Nova Revendedora', phone: '11988887777' } } as unknown as Request,
          { json: jest.fn() } as unknown as Response,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(resellerRepository.create).not.toHaveBeenCalled();
    });
  });

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

  // specs/0205-comissao-revendedor REQ-12.
  it('GET /reseller/me/commissions devolve a lista com nome do restaurante resolvido e os totais pendente/pago', async () => {
    const { routes } = setup({
      commission: {
        listByReseller: jest.fn().mockResolvedValue([
          { id: 'c-1', resellerId: 'reseller-1', restaurantId: 'r-1', subscriptionObligationId: 'ob-1', obligationKind: 'monthly', obligationAmountCents: 7990, commissionCents: 7990, status: 'pendente', createdAt: new Date('2026-10-05') },
          { id: 'c-2', resellerId: 'reseller-1', restaurantId: 'r-1', subscriptionObligationId: 'ob-2', obligationKind: 'monthly', obligationAmountCents: 7990, commissionCents: 7990, status: 'pago', createdAt: new Date('2026-09-05'), paidAt: new Date('2026-09-10') },
        ]),
      },
    });
    const json = jest.fn();

    await runChain(routes['GET /reseller/me/commissions'], { resellerId: 'reseller-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      pendingCents: 7990,
      paidCents: 7990,
      commissions: [
        expect.objectContaining({ id: 'c-1', restaurantName: 'Pizzaria do João', status: 'pendente' }),
        expect.objectContaining({ id: 'c-2', restaurantName: 'Pizzaria do João', status: 'pago' }),
      ],
    }));
  });

  // Pedido explícito do usuário (follow-up) — dados bancários autoatendidos, sem precisar chamar
  // o financeiro no WhatsApp.
  it('PATCH /reseller/me/bank-data salva a chave Pix do revendedor logado', async () => {
    const { resellerRepository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['PATCH /reseller/me/bank-data'],
      { resellerId: 'reseller-1', body: { pixKey: 'ana@pix.com' } },
      { json },
    );

    expect(resellerRepository.updatePixKey).toHaveBeenCalledWith('reseller-1', 'ana@pix.com');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      pixKey: 'ana@pix.com',
      referralLink: 'https://bsdelivery.com.br/gratis?revenda=ABC123',
    }));
  });

  it('rejeita PATCH /reseller/me/bank-data sem chave Pix', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['PATCH /reseller/me/bank-data'], { resellerId: 'reseller-1', body: {} }, { json: jest.fn() }),
    ).rejects.toThrow();
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
