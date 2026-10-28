import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IInstagramPostRepository } from '../domain/repositories/instagram-post.repository.interface';
import { FacebookGraphClient } from '../infra/facebook-graph-client';
import { InstagramAutomationController } from './instagram-automation.controller';
import { environment } from '../../../shared/config/environment';

jest.mock('../infra/facebook-graph-client');
jest.mock('../../../shared/config/environment', () => ({
  environment: {
    facebook: { appId: 'app-id', appSecret: 'app-secret', redirectUri: 'https://bsdelivery.com.br/painel/settings/instagram/callback', graphBaseUrl: 'https://graph.facebook.com/v21.0' },
  },
}));

type FakeRequest = Partial<Pick<Request, 'body' | 'params'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildPost(overrides: Record<string, unknown> = {}) {
  return { id: 'post-1', restaurantId: 'r-1', imageUrl: 'https://cdn.example.com/foto.jpg', caption: 'Promoção!', scheduledAt: '2026-10-28T12:00:00.000Z', status: 'agendado', createdAt: '2026-10-27T10:00:00.000Z', ...overrides };
}

describe('InstagramAutomationController (follow-up — automação de postagens no Instagram)', () => {
  const MockedFacebookGraphClient = FacebookGraphClient as jest.MockedClass<typeof FacebookGraphClient>;

  beforeEach(() => {
    MockedFacebookGraphClient.mockClear();
    MockedFacebookGraphClient.prototype.exchangeCodeForToken = jest.fn().mockResolvedValue({ accessToken: 'short-token' });
    MockedFacebookGraphClient.prototype.getLongLivedToken = jest.fn().mockResolvedValue({ accessToken: 'long-token' });
    MockedFacebookGraphClient.prototype.resolveInstagramBusinessAccount = jest
      .fn()
      .mockResolvedValue({ pageId: 'page-1', pageAccessToken: 'page-token', instagramAccountId: 'ig-1', instagramUsername: 'minha_loja' });
  });
  afterEach(() => jest.restoreAllMocks());

  function setup(overrides: { restaurantRepository?: Partial<IRestaurantRepository>; postRepository?: Partial<IInstagramPostRepository> } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      saveInstagramTokens: jest.fn().mockResolvedValue({ id: 'r-1' }),
      clearInstagramConnection: jest.fn().mockResolvedValue({ id: 'r-1' }),
      ...overrides.restaurantRepository,
    };
    const postRepository: Partial<IInstagramPostRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildPost()]),
      create: jest.fn().mockResolvedValue(buildPost()),
      delete: jest.fn().mockResolvedValue(true),
      ...overrides.postRepository,
    };
    const { application, routes } = buildApp();
    new InstagramAutomationController(
      restaurantRepository as IRestaurantRepository,
      postRepository as IInstagramPostRepository,
      jest.fn(),
    ).initializeRoutes(application);
    return { restaurantRepository, postRepository, routes };
  }

  it('config: devolve o necessário pra montar a URL de autorização sem expor appSecret', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/instagram/config'], {}, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, { configured: true, appId: 'app-id', redirectUri: environment.facebook.redirectUri, missing: [] });
    expect(JSON.stringify(json.mock.calls)).not.toContain('app-secret');
  });

  it('callback: troca o code, resolve a conta Instagram Business e persiste sem devolver o token', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/instagram/callback'], { restaurantId: 'r-1', body: { code: 'code-1' } }, { json, send: jest.fn() });

    expect(MockedFacebookGraphClient.prototype.exchangeCodeForToken).toHaveBeenCalledWith('code-1', environment.facebook.redirectUri);
    expect(MockedFacebookGraphClient.prototype.getLongLivedToken).toHaveBeenCalledWith('short-token');
    expect(restaurantRepository.saveInstagramTokens).toHaveBeenCalledWith('r-1', {
      instagramAccessToken: 'page-token',
      instagramAccountId: 'ig-1',
      instagramPageId: 'page-1',
      instagramUsername: 'minha_loja',
    });
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('instagramAccessToken');
    expect(payload).toEqual({ instagramLinked: true, instagramUsername: 'minha_loja' });
  });

  it('callback: 503 quando nenhuma Página tem Instagram Business vinculado', async () => {
    MockedFacebookGraphClient.prototype.resolveInstagramBusinessAccount = jest.fn().mockResolvedValue(null);
    const { restaurantRepository, routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/instagram/callback'], { restaurantId: 'r-1', body: { code: 'code-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(restaurantRepository.saveInstagramTokens).not.toHaveBeenCalled();
  });

  it('payload inválido (sem code) é rejeitado antes de chamar o Facebook', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/instagram/callback'], { restaurantId: 'r-1', body: {} }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(MockedFacebookGraphClient.prototype.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('DELETE /restaurants/me/instagram desvincula a conta', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/instagram'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.clearInstagramConnection).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('GET scheduled-posts lista as postagens do restaurante do token', async () => {
    const { postRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/instagram/scheduled-posts'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(postRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'post-1' })]);
  });

  it('POST scheduled-posts cria a postagem agendada pro restaurante do token', async () => {
    const { postRepository, routes } = setup();
    const json = jest.fn();
    const input = { imageUrl: 'https://cdn.example.com/foto.jpg', caption: 'Promoção!', scheduledAt: '2026-10-28T12:00:00.000Z' };

    await runOperatorChain(routes['POST /restaurants/me/instagram/scheduled-posts'], { restaurantId: 'r-1', body: input }, { json, send: jest.fn() });

    expect(postRepository.create).toHaveBeenCalledWith({ restaurantId: 'r-1', ...input });
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'post-1' }));
  });

  it('rejeita POST scheduled-posts com legenda vazia ou URL de imagem inválida', async () => {
    const { postRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/instagram/scheduled-posts'],
        { restaurantId: 'r-1', body: { imageUrl: 'nao-e-url', caption: '', scheduledAt: '2026-10-28T12:00:00.000Z' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(postRepository.create).not.toHaveBeenCalled();
  });

  it('DELETE scheduled-posts/:id cancela a postagem enquanto ainda está agendada', async () => {
    const { postRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/instagram/scheduled-posts/:id'], { restaurantId: 'r-1', params: { id: 'post-1' } }, { json: jest.fn(), send });

    expect(postRepository.delete).toHaveBeenCalledWith('post-1', 'r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('DELETE scheduled-posts/:id lança 404 quando já publicada ou não encontrada', async () => {
    const { routes } = setup({ postRepository: { delete: jest.fn().mockResolvedValue(false) } });

    await expect(
      runOperatorChain(routes['DEL /restaurants/me/instagram/scheduled-posts/:id'], { restaurantId: 'r-1', params: { id: 'post-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
