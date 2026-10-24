import type { Request, Response, Server } from 'restify';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { DEFAULT_SUPPORT_SETTINGS, type SupportSettings } from '../domain/support-settings';
import { SupportController } from './support.controller';

type Handler = (req: Request, res: Response) => Promise<void>;

function setup() {
  let stored = { ...DEFAULT_SUPPORT_SETTINGS };
  const repository = {
    get: jest.fn(async () => stored),
    update: jest.fn(async (settings: SupportSettings) => { stored = settings; return settings; }),
  };
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes[`${method} ${path}`] = handlers;
  };
  const admin = buildPlatformAdminMiddleware(['owner@example.com']);
  new SupportController(repository, admin).initializeRoutes({
    get: register('GET'), put: register('PUT'),
  } as unknown as Server);
  async function run(route: string, body?: unknown, email = 'owner@example.com') {
    const json = jest.fn();
    const handlers = routes[route];
    const req = { body, user: { email } } as Request;
    // Firebase tem testes proprios; executa o middleware real da plataforma e o handler.
    for (const handler of handlers.filter((item) => item !== firebaseAuthMiddleware)) {
      await handler(req, { json } as unknown as Response);
    }
    return json;
  }
  return { repository, routes, admin, run };
}

describe('SupportController - 0181', () => {
  it('leitura publica retorna defaults sem autenticação, incluindo R$ 49,90 e regras de itens', async () => {
    const { routes, run } = setup();
    expect(routes['GET /support/public']).toHaveLength(1);
    const json = await run('GET /support/public');
    expect(json).toHaveBeenCalledWith(200, DEFAULT_SUPPORT_SETTINGS);
    expect(DEFAULT_SUPPORT_SETTINGS).toMatchObject({
      trainingPriceCents: 4990, trainingIncludedItems: 50, trainingExtraItemPriceCents: 100,
    });
  });

  it('GET e PUT administrativos usam Firebase e a guarda da plataforma', async () => {
    const { routes, admin, run, repository } = setup();
    for (const route of ['GET /platform/support-settings', 'PUT /platform/support-settings']) {
      expect(routes[route].slice(0, 2)).toEqual([firebaseAuthMiddleware, admin]);
      await expect(run(route, DEFAULT_SUPPORT_SETTINGS, 'operator@example.com')).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('salva contatos por setor, horario e oferta e usa os mesmos valores nas duas leituras', async () => {
    const { run, repository } = setup();
    const next = {
      ...DEFAULT_SUPPORT_SETTINGS, commercialWhatsapp: '5511999999999', financialWhatsapp: '5521999999999',
      businessHours: 'Segunda a sexta, 9h às 18h', trainingPriceCents: 6990,
      trainingUnlimitedItems: false, trainingIncludedItems: 70, trainingExtraItemPriceCents: 200,
    };
    const json = await run('PUT /platform/support-settings', next);
    expect(repository.update).toHaveBeenCalledWith(next);
    expect(json).toHaveBeenCalledWith(200, next);
    expect(await run('GET /platform/support-settings')).toHaveBeenCalledWith(200, next);
    expect(await run('GET /support/public')).toHaveBeenCalledWith(200, next);
  });

  it.each([
    { whatsapp: 'abc' }, { commercialWhatsapp: '' }, { financialWhatsapp: '+55 (85)' },
    { email: 'invalid' }, { email: '' }, { businessHours: ' ' }, { businessHours: 'a'.repeat(501) },
    { trainingPriceCents: -1 }, { trainingPriceCents: 49.9 },
    { trainingUnlimitedItems: 'false' }, { trainingIncludedItems: 1.5 },
    { trainingExtraItemPriceCents: -1 }, { trainingExtraItemPriceCents: Number.MAX_SAFE_INTEGER + 1 },
    { extraField: 'not-allowed' },
  ])('rejeita configuracao invalida %j sem persistir', async (change) => {
    const { run, repository } = setup();
    await expect(run('PUT /platform/support-settings', { ...DEFAULT_SUPPORT_SETTINGS, ...change }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejeita payload incompleto e aceita zero sem transformar em default', async () => {
    const { run, repository } = setup();
    await expect(run('PUT /platform/support-settings', {})).rejects.toMatchObject({ statusCode: 400 });
    const next = { ...DEFAULT_SUPPORT_SETTINGS, trainingPriceCents: 0, trainingIncludedItems: 0, trainingExtraItemPriceCents: 0 };
    await run('PUT /platform/support-settings', next);
    expect(repository.update).toHaveBeenCalledWith(next);
  });

  it('propaga falha de banco sem confirmar sucesso', async () => {
    const { run, repository } = setup();
    repository.update.mockRejectedValueOnce(new Error('Mongo indisponível'));
    await expect(run('PUT /platform/support-settings', DEFAULT_SUPPORT_SETTINGS)).rejects.toThrow('Mongo indisponível');
    repository.get.mockRejectedValueOnce(new Error('Mongo indisponível'));
    await expect(run('GET /support/public')).rejects.toThrow('Mongo indisponível');
  });
});
