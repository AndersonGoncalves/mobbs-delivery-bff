import type { Request, Response, Server } from 'restify';

import { ICampaign } from '../domain/entities/campaign.entity';
import { ICampaignOptOutRepository } from '../domain/repositories/campaign-opt-out.repository.interface';
import { ICampaignRepository } from '../domain/repositories/campaign.repository.interface';
import { ICampaignDispatchService } from '../domain/services/i-campaign-dispatch.service';
import { CampaignsController } from './campaigns.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & {
  user?: { uid: string; email?: string };
  restaurantId?: string;
};
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// `/restaurants/me/campaigns*` passa por firebaseAuthMiddleware + restaurantOperatorMiddleware +
// requireOperatorRole — mesmo padrão de coupons.controller.spec.ts, pula os três.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

// `/campaigns/unsubscribe/:token` é público — roda o handler único direto, sem pular middleware nenhum.
async function runPublicChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

function buildCampaign(overrides: Partial<ICampaign> = {}): ICampaign {
  return {
    id: 'camp-1',
    restaurantId: 'r-1',
    message: 'Promoção especial!',
    campaignCode: 'abc123def0',
    status: 'sending',
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
    createdAt: '2026-10-07T12:00:00.000Z',
    ...overrides,
  };
}

describe('CampaignsController', () => {
  function setup(overrides: { campaignRepository?: Partial<ICampaignRepository>; campaignOptOutRepository?: Partial<ICampaignOptOutRepository>; campaignDispatchService?: Partial<ICampaignDispatchService> } = {}) {
    const campaignRepository: Partial<ICampaignRepository> = {
      create: jest.fn().mockResolvedValue(buildCampaign()),
      findManyByRestaurant: jest.fn().mockResolvedValue([buildCampaign()]),
      ...overrides.campaignRepository,
    };
    const campaignOptOutRepository: Partial<ICampaignOptOutRepository> = {
      optOutByToken: jest.fn().mockResolvedValue({ restaurantId: 'r-1', customerId: 'c-1' }),
      ...overrides.campaignOptOutRepository,
    };
    const campaignDispatchService: Partial<ICampaignDispatchService> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      ...overrides.campaignDispatchService,
    };

    const { application, routes } = buildFakeApplication();
    new CampaignsController(
      campaignRepository as ICampaignRepository,
      campaignOptOutRepository as ICampaignOptOutRepository,
      campaignDispatchService as ICampaignDispatchService,
      jest.fn(),
    ).initializeRoutes(application);

    return { routes, campaignRepository, campaignOptOutRepository, campaignDispatchService };
  }

  // AC-1/REQ-1/REQ-4 — cria a campanha e dispara o envio sem esperar (a resposta não depende do
  // término do dispatch).
  it('POST /restaurants/me/campaigns cria a campanha, responde 201 e dispara o envio', async () => {
    const { routes, campaignRepository, campaignDispatchService } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/campaigns'],
      { restaurantId: 'r-1', body: { message: 'Promoção especial!' } },
      { json },
    );

    expect(campaignRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ message: 'Promoção especial!', campaignCode: expect.any(String) }),
    );
    expect(campaignDispatchService.dispatch).toHaveBeenCalledWith('camp-1');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'camp-1' }));
  });

  // dispatch falhando (promise rejeitada) não deve derrubar a resposta HTTP já dada.
  it('se o dispatch em segundo plano falhar, a resposta 201 já foi dada normalmente', async () => {
    const { routes } = setup({ campaignDispatchService: { dispatch: jest.fn().mockRejectedValue(new Error('falhou')) } });
    const json = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await runOperatorChain(
      routes['POST /restaurants/me/campaigns'],
      { restaurantId: 'r-1', body: { message: 'Promoção especial!' } },
      { json },
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'camp-1' }));
    jest.restoreAllMocks();
  });

  // AC-4/REQ-7.
  it('GET /restaurants/me/campaigns devolve o histórico do restaurante', async () => {
    const { routes, campaignRepository } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/campaigns'], { restaurantId: 'r-1' }, { json });

    expect(campaignRepository.findManyByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'camp-1' })]);
  });

  // AC-3/REQ-5 — descadastro público, sem middleware de autenticação.
  it('POST /campaigns/unsubscribe/:token marca o cliente como descadastrado', async () => {
    const { routes, campaignOptOutRepository } = setup();
    const json = jest.fn();

    await runPublicChain(routes['POST /campaigns/unsubscribe/:token'], { params: { token: 'token-1' } }, { json });

    expect(campaignOptOutRepository.optOutByToken).toHaveBeenCalledWith('token-1');
    expect(json).toHaveBeenCalledWith(200, { unsubscribed: true });
  });

  it('POST /campaigns/unsubscribe/:token com token inexistente lança 404', async () => {
    const { routes } = setup({ campaignOptOutRepository: { optOutByToken: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await expect(
      runPublicChain(routes['POST /campaigns/unsubscribe/:token'], { params: { token: 'invalido' } }, { json }),
    ).rejects.toThrow('Link de descadastro inválido');
  });
});
