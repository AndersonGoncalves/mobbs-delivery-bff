import type { Request, Response, Server } from 'restify';
import { SuggestionsController } from './suggestions.controller';
import { ISuggestionRepository, Suggestion } from '../domain/suggestion';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';

const id = 'ad1a9670-4bbb-44be-971f-a869b91fe340';
const suggestion: Suggestion = {
  id, restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'operador@example.com',
  title: 'Melhorar cardápio', description: 'Permitir ordenar os produtos.',
  status: 'received', revision: 0, updates: [], createdAt: new Date(), updatedAt: new Date(),
};
type Handler = (req: Request, res: Response) => Promise<void>;

function setup() {
  const repository: jest.Mocked<ISuggestionRepository> = {
    create: jest.fn().mockResolvedValue(suggestion),
    list: jest.fn().mockResolvedValue({ items: [suggestion], total: 1 }),
    findById: jest.fn().mockImplementation(async (_, restaurantId?: string) => restaurantId && restaurantId !== 'r1' ? null : suggestion),
    update: jest.fn().mockResolvedValue({ ...suggestion, revision: 1 }),
    markRead: jest.fn().mockResolvedValue(undefined),
    unreadCount: jest.fn().mockResolvedValue(1),
  };
  const restaurants = { findById: jest.fn().mockResolvedValue({ name: 'Loja' }) } as unknown as IRestaurantRepository;
  const routes: Record<string, Handler[]> = {};
  const app = Object.fromEntries(['get', 'post', 'patch'].map((method) => [
    method, (path: string, ...handlers: Handler[]) => { routes[`${method} ${path}`] = handlers; },
  ])) as unknown as Server;
  const operator = jest.fn(async (req: Request) => {
    req.restaurantId = req.restaurantId ?? 'r1';
    req.operatorId = 'op1';
  });
  new SuggestionsController(repository, restaurants, operator, buildPlatformAdminMiddleware(['admin@example.com'])).initializeRoutes(app);
  const json = jest.fn();
  const send = jest.fn();
  async function run(route: string, partial: Partial<Request> = {}) {
    const req = {
      params: { id }, query: {}, body: {}, user: { uid: 'u1', email: 'operador@example.com' }, ...partial,
    } as Request;
    for (const handler of routes[route].slice(1)) await handler(req, { json, send } as unknown as Response);
  }
  return { repository, run, json, send };
}

describe('Sugestões 0179', () => {
  it('AC-1: cria com identidade/loja do token e sem aceitar status do cliente', async () => {
    const { repository, run, json } = setup();
    await run('post /restaurants/me/suggestions', { body: { title: ' Novo recurso ', description: ' Uma descrição detalhada. ' } });
    expect(repository.create).toHaveBeenCalledWith({
      title: 'Novo recurso', description: 'Uma descrição detalhada.',
      restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'operador@example.com',
    });
    expect(json).toHaveBeenCalledWith(201, suggestion);
  });
  it.each([
    { title: ' ', description: 'Uma descrição detalhada.' },
    { title: 'Recurso', description: 'curta' },
    { title: 'x'.repeat(151), description: 'Uma descrição detalhada.' },
    { title: 'Recurso', description: 'x'.repeat(5001) },
    { title: 'Recurso', description: 'Uma descrição detalhada.', restaurantId: 'outra' },
    { title: 'Recurso', description: 'Uma descrição detalhada.', status: 'implemented' },
  ])('AC-1: rejeita payload inválido %#', async (body) => {
    const { repository, run } = setup();
    await expect(run('post /restaurants/me/suggestions', { body })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('AC-2: lista paginada e contador usam restaurante e operador autenticados', async () => {
    const { repository, run, json } = setup();
    await run('get /restaurants/me/suggestions', { query: { page: '2', pageSize: '10', status: 'under_review', restaurantId: 'outra' } });
    expect(repository.list).toHaveBeenCalledWith({ page: 2, pageSize: 10, status: 'under_review', restaurantId: 'r1', operatorId: 'op1' });
    await run('get /restaurants/me/suggestions/unread');
    expect(repository.unreadCount).toHaveBeenCalledWith('r1', 'op1');
    expect(json).toHaveBeenCalledWith(200, { count: 1 });
  });
  it.each(['get /restaurants/me/suggestions/:id', 'post /restaurants/me/suggestions/:id/read'])('AC-2: isola %s', async (route) => {
    const { repository, run } = setup();
    await expect(run(route, { restaurantId: 'outra', body: { revision: 0 } })).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.markRead).not.toHaveBeenCalled();
  });
  it.each(['get /platform/suggestions', 'get /platform/suggestions/:id', 'patch /platform/suggestions/:id'])('AC-3: nega operador em %s', async (route) => {
    const { run, repository } = setup();
    await expect(run(route)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('AC-3: admin lista todas e responde com histórico datado', async () => {
    const { run, repository } = setup();
    const user = { uid: 'admin', email: 'admin@example.com' };
    await run('get /platform/suggestions', { user });
    expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    await run('patch /platform/suggestions/:id', { user, body: { revision: 0, status: 'under_review', reply: ' Vamos analisar. ' } });
    expect(repository.update).toHaveBeenCalledWith(id, 0, { status: 'under_review', reply: 'Vamos analisar.', createdAt: expect.any(Date) });
  });
  it('AC-3: permite só resposta ou só alteração de status, rejeita atualização vazia', async () => {
    const { run, repository } = setup();
    const user = { uid: 'admin', email: 'admin@example.com' };
    await run('patch /platform/suggestions/:id', { user, body: { revision: 0, status: 'received', reply: 'Obrigado pela sugestão!' } });
    await run('patch /platform/suggestions/:id', { user, body: { revision: 0, status: 'declined' } });
    expect(repository.update).toHaveBeenCalledTimes(2);
    await expect(run('patch /platform/suggestions/:id', { user, body: { revision: 0, status: 'received', reply: '  ' } })).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ revision: 1, status: 'implemented' }, { revision: 0, status: 'invalid' }])('AC-3: rejeita revisão/status inválidos %p', async (body) => {
    const { run, repository } = setup();
    await expect(run('patch /platform/suggestions/:id', { user: { uid: 'admin', email: 'admin@example.com' }, body })).rejects.toMatchObject({ statusCode: body.revision ? 409 : 400 });
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('AC-3: conflito no compare-and-set não retorna sucesso', async () => {
    const { run, repository } = setup();
    repository.update.mockResolvedValue(null);
    await expect(run('patch /platform/suggestions/:id', { user: { uid: 'admin', email: 'admin@example.com' }, body: { revision: 0, status: 'implemented' } })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('AC-4: registra apenas revisão visualizada, rejeitando revisão futura', async () => {
    const { run, repository, send } = setup();
    repository.findById.mockResolvedValue({ ...suggestion, revision: 2 });
    await run('post /restaurants/me/suggestions/:id/read', { body: { revision: 1 } });
    expect(repository.markRead).toHaveBeenCalledWith(id, 'op1', 1);
    expect(send).toHaveBeenCalledWith(204);
    await expect(run('post /restaurants/me/suggestions/:id/read', { body: { revision: 3 } })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.markRead).toHaveBeenCalledTimes(1);
  });
  it.each([{ page: 0 }, { pageSize: 51 }, { status: 'invalid' }])('valida paginação/filtro %p', async (query) => {
    const { run } = setup();
    await expect(run('get /restaurants/me/suggestions', { query })).rejects.toMatchObject({ statusCode: 400 });
  });
});
