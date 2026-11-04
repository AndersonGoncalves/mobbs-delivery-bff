import type { Request, Response, Server } from 'restify';
import type { HelpArticle } from '../domain/help-article';
import { HelpArticleController } from './help-article.controller';

type Handler = (req: Request, res: Response) => Promise<void>;

function buildArticle(overrides: Partial<HelpArticle> = {}): HelpArticle {
  return {
    id: 'a1', audience: 'retaguarda', moduleKey: 'restaurante', moduleLabel: 'Restaurante', moduleOrder: 1,
    itemLabel: 'Formas de Pagamento', itemOrder: 3, linkTo: '/settings/payment-methods', title: 'Formas de Pagamento',
    steps: [{ text: 'Abra Restaurante > Formas de Pagamento.' }], createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const repository = { list: jest.fn(async () => [buildArticle()]), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  // Pedido da spec (REQ-9) — sem checagem de papel: o mock representa "qualquer operador
  // autenticado", nunca rejeita por papel, ao contrário de `platformAdminMiddleware` em outros
  // controllers.
  const operatorMiddleware = jest.fn(async () => undefined);
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => { routes[`${method} ${path}`] = handlers; };
  new HelpArticleController(repository, operatorMiddleware as unknown as Handler).initializeRoutes({
    get: register('GET'),
  } as unknown as Server);

  async function run(route: string, req: Partial<Request> = {}) {
    const json = jest.fn();
    const send = jest.fn();
    const handlers = routes[route];
    // Pula firebaseAuthMiddleware e restaurantOperatorMiddleware — já cobertos em teste próprio;
    // aqui só interessa o handler da rota em si.
    const chain = handlers.slice(2);
    for (const handler of chain) await handler({ headers: {}, query: {}, ...req } as Request, { json, send } as unknown as Response);
    return { json, send };
  }

  return { repository, operatorMiddleware, run };
}

it('REQ-8: lista artigos da audience pedida', async () => {
  const { repository, run } = setup();
  const { json } = await run('GET /help/articles', { query: { audience: 'retaguarda' } });
  expect(repository.list).toHaveBeenCalledWith('retaguarda');
  expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'a1' })]);
});

it('REQ-9/AC-6: a rota não checa papel do operador — qualquer papel autenticado acessa', () => {
  const { routes } = (() => {
    const repository = { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    const operatorMiddleware = jest.fn();
    const routes: Record<string, Handler[]> = {};
    const register = (method: string) => (path: string, ...handlers: Handler[]) => { routes[`${method} ${path}`] = handlers; };
    new HelpArticleController(repository, operatorMiddleware as unknown as Handler).initializeRoutes({ get: register('GET') } as unknown as Server);
    return { routes };
  })();
  // Só 2 guardas (Firebase + resolução de operador) antes do handler — nenhuma guarda extra de papel.
  expect(routes['GET /help/articles']).toHaveLength(3);
});
