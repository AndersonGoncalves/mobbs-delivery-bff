import type { Request, Response, Server } from 'restify';

import { IProspectRepository } from '../domain/repositories/prospect.repository.interface';
import { IPlacesSearchService } from '../domain/services/i-places-search.service';
import { ProspectsController } from './prospects.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'query' | 'body'>>;
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

// `/platform/*` passa por firebaseAuthMiddleware + platformAdminMiddleware — pula os dois,
// mesmo padrão de `platform.controller.spec.ts`.
async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildProspect(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prospect-1',
    placeId: 'place-1',
    establishmentName: 'Pizzaria do João',
    category: 'pizzaria',
    phone: '(85) 98640-4604',
    address: 'Rua A, 123',
    latitude: -3.73,
    longitude: -38.52,
    rating: 4.5,
    createdAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('ProspectsController (specs/0123-prospeccao-restaurantes-google-maps)', () => {
  function setup(overrides: { placesSearchService?: Partial<IPlacesSearchService>; prospectRepository?: Partial<IProspectRepository> } = {}) {
    const placesSearchService: Partial<IPlacesSearchService> = {
      searchNearby: jest.fn().mockResolvedValue([
        { placeId: 'place-1', name: 'Pizzaria do João', address: 'Rua A, 123', phone: '(85) 98640-4604', rating: 4.5, latitude: -3.73, longitude: -38.52 },
      ]),
      ...overrides.placesSearchService,
    };
    const prospectRepository: Partial<IProspectRepository> = {
      findByPlaceId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(buildProspect()),
      listAll: jest.fn().mockResolvedValue([buildProspect()]),
      ...overrides.prospectRepository,
    };
    const platformAdminMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new ProspectsController(
      placesSearchService as IPlacesSearchService,
      prospectRepository as IProspectRepository,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { routes, placesSearchService, prospectRepository };
  }

  it('AC-3: GET /platform/prospects/search busca na Google Places API com o ramo mapeado certo', async () => {
    const { routes, placesSearchService } = setup();
    const json = jest.fn();

    await runAdminChain(
      routes['GET /platform/prospects/search'],
      { query: { latitude: '-3.73', longitude: '-38.52', radiusMeters: '5000', category: 'pizzaria' } },
      { json },
    );

    expect(placesSearchService.searchNearby).toHaveBeenCalledWith({
      latitude: -3.73,
      longitude: -38.52,
      radiusMeters: 5000,
      placesType: 'pizza_restaurant',
    });
    expect(json).toHaveBeenCalledWith(200, expect.arrayContaining([expect.objectContaining({ placeId: 'place-1' })]));
  });

  // REQ-8 — falha da API vira 500 com mensagem clara, não derruba a rota.
  it('AC-5: busca com falha da Google Places API responde 500 com mensagem clara', async () => {
    const { routes } = setup({
      placesSearchService: { searchNearby: jest.fn().mockRejectedValue(new Error('GOOGLE_PLACES_API_KEY não configurada')) },
    });

    await expect(
      runAdminChain(
        routes['GET /platform/prospects/search'],
        { query: { latitude: '-3.73', longitude: '-38.52', radiusMeters: '5000', category: 'pizzaria' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it('categoria fora da lista curada é rejeitada (400)', async () => {
    const { routes } = setup();

    await expect(
      runAdminChain(
        routes['GET /platform/prospects/search'],
        { query: { latitude: '-3.73', longitude: '-38.52', radiusMeters: '5000', category: 'pastelaria' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-4: POST /platform/prospects salva os itens selecionados', async () => {
    const { routes, prospectRepository } = setup();
    const json = jest.fn();

    await runAdminChain(
      routes['POST /platform/prospects'],
      {
        body: {
          items: [
            { placeId: 'place-1', establishmentName: 'Pizzaria do João', category: 'pizzaria', latitude: -3.73, longitude: -38.52 },
          ],
        },
      },
      { json },
    );

    expect(prospectRepository.create).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'place-1' }));
    expect(json).toHaveBeenCalledWith(201, expect.arrayContaining([expect.objectContaining({ placeId: 'place-1' })]));
  });

  // REQ-9 — já existe por placeId: não duplica, devolve o já salvo.
  it('AC-6: salvar um prospect que já existe (mesmo placeId) não duplica', async () => {
    const { routes, prospectRepository } = setup({
      prospectRepository: { findByPlaceId: jest.fn().mockResolvedValue(buildProspect()) },
    });
    const json = jest.fn();

    await runAdminChain(
      routes['POST /platform/prospects'],
      {
        body: {
          items: [
            { placeId: 'place-1', establishmentName: 'Pizzaria do João', category: 'pizzaria', latitude: -3.73, longitude: -38.52 },
          ],
        },
      },
      { json },
    );

    expect(prospectRepository.create).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(201, [expect.objectContaining({ placeId: 'place-1' })]);
  });

  it('GET /platform/prospects lista os prospects salvos, filtrando por categoria quando informada', async () => {
    const { routes, prospectRepository } = setup();
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/prospects'], { query: { category: 'pizzaria' } }, { json });

    expect(prospectRepository.listAll).toHaveBeenCalledWith('pizzaria');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'prospect-1' })]);
  });
});
