import restify, { type Server } from 'restify';
import { UnauthorizedError } from 'restify-errors';
import type { AddressInfo } from 'net';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import { handleError } from './error.handler';
import {
  formatServerErrorLogLine,
  formatWebhookLogLine,
  isWebhookPath,
  pathWithoutQuery,
  registerWebhookRequestLog,
  sanitizeLogMessage,
} from './request-log';

// specs/0215-ambiente-homologacao T019.
describe('request-log — funções puras', () => {
  it('tira a query string (o webhook da Uber leva o token em ?token=)', () => {
    expect(pathWithoutQuery('/webhooks/uber-direct/r1?token=SEGREDO')).toBe('/webhooks/uber-direct/r1');
    expect(pathWithoutQuery('/webhooks/asaas/r1')).toBe('/webhooks/asaas/r1');
  });

  it('reconhece só rotas de webhook', () => {
    expect(isWebhookPath('/webhooks/mercadopago')).toBe(true);
    expect(isWebhookPath('/webhooks/uber-direct/r1?token=x')).toBe(true);
    expect(isWebhookPath('/restaurants/me/orders')).toBe(false);
    expect(isWebhookPath('/webhooksfalso')).toBe(false);
  });

  it('mensagem numa linha só e com no máximo 200 caracteres', () => {
    expect(sanitizeLogMessage('linha 1\nlinha 2\t  fim')).toBe('linha 1 linha 2 fim');
    expect(sanitizeLogMessage('x'.repeat(500))).toHaveLength(201);
  });

  it('monta a linha de webhook com método, caminho sem query, status, duração e erro', () => {
    expect(formatWebhookLogLine({ method: 'POST', path: '/webhooks/uber-direct/r1?token=SEGREDO', statusCode: 401, durationMs: 3.4, errorMessage: 'Token inválido' })).toBe(
      '[webhook] POST /webhooks/uber-direct/r1 → 401 (3ms) Token inválido',
    );
    expect(formatWebhookLogLine({ method: 'POST', path: '/webhooks/mercadopago', statusCode: 200, durationMs: 84 })).toBe(
      '[webhook] POST /webhooks/mercadopago → 200 (84ms)',
    );
  });

  it('monta a linha de erro 500 sem query string', () => {
    expect(formatServerErrorLogLine({ method: 'GET', path: '/x?token=SEGREDO', errorName: 'TypeError', errorMessage: 'boom' })).toBe(
      '[erro 500] GET /x — TypeError: boom',
    );
  });
});

describe('request-log — servidor Restify de verdade', () => {
  let server: Server;
  let baseUrl: string;
  let logged: string[];
  const spies: jest.SpyInstance[] = [];

  beforeAll(async () => {
    server = restify.createServer();
    server.use(restify.plugins.queryParser());
    server.use(restify.plugins.bodyParser());
    server.on('restifyError', handleError);
    registerWebhookRequestLog(server);
    server.post('/webhooks/ok', (_req, res, next) => {
      res.send(200, { ok: true });
      return next();
    });
    server.post('/webhooks/uber-direct/:restaurantId', (_req, _res, next) => next(new UnauthorizedError('Token inválido')));
    // Mesmo formato das rotas reais do BFF (async, erro lançado dentro do handler).
    server.post('/webhooks/boom', async () => {
      throw new Error('falhou processando o aviso');
    });
    server.get('/restaurants/me', (_req, res, next) => {
      res.send(200, {});
      return next();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    logged = [];
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    spies.push(jest.spyOn(console, 'log').mockImplementation(capture));
    spies.push(jest.spyOn(console, 'warn').mockImplementation(capture));
    spies.push(jest.spyOn(console, 'error').mockImplementation(capture));
  });

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
  });

  // O evento `after` do Restify dispara depois da resposta — espera a linha aparecer.
  async function waitForLog(fragment: string): Promise<string[]> {
    for (let i = 0; i < 50 && !logged.some((line) => line.includes(fragment)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return logged;
  }

  it('webhook aceito: 1 linha com status 200', async () => {
    const res = await fetch(`${baseUrl}/webhooks/ok`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cpf: '12345678900' }) });
    expect(res.status).toBe(200);
    const lines = await waitForLog('/webhooks/ok');
    expect(lines.filter((line) => line.startsWith('[webhook]'))).toEqual([expect.stringMatching(/^\[webhook\] POST \/webhooks\/ok → 200 \(\d+ms\)$/)]);
    // Corpo da requisição nunca vai pro log.
    expect(lines.join('\n')).not.toContain('12345678900');
  });

  it('webhook recusado: status + motivo, e o token da query NÃO aparece', async () => {
    const res = await fetch(`${baseUrl}/webhooks/uber-direct/r1?token=SEGREDO-UBER`, { method: 'POST' });
    expect(res.status).toBe(401);
    const lines = await waitForLog('/webhooks/uber-direct/r1');
    expect(lines).toContainEqual(expect.stringMatching(/^\[webhook\] POST \/webhooks\/uber-direct\/r1 → 401 \(\d+ms\) Token inválido$/));
    expect(lines.join('\n')).not.toContain('SEGREDO-UBER');
  });

  it('webhook com erro inesperado: linha de webhook 500 + linha [erro 500] com a pilha', async () => {
    const res = await fetch(`${baseUrl}/webhooks/boom`, { method: 'POST' });
    expect(res.status).toBe(500);
    const lines = await waitForLog('[webhook] POST /webhooks/boom');
    expect(lines).toContainEqual(expect.stringMatching(/^\[webhook\] POST \/webhooks\/boom → 500 \(\d+ms\) falhou processando o aviso$/));
    expect(lines).toContainEqual(expect.stringContaining('[erro 500] POST /webhooks/boom — Error: falhou processando o aviso'));
  });

  it('URL de webhook errada (404) também aparece — ajuda a achar URL mal configurada no parceiro', async () => {
    const res = await fetch(`${baseUrl}/webhooks/nao-existe?token=SEGREDO-404`, { method: 'POST' });
    expect(res.status).toBe(404);
    const lines = await waitForLog('/webhooks/nao-existe');
    expect(lines).toContainEqual(expect.stringMatching(/^\[webhook\] POST \/webhooks\/nao-existe → 404/));
    expect(lines.join('\n')).not.toContain('SEGREDO-404');
  });

  it('rota comum (não webhook) não gera linha de webhook', async () => {
    const res = await fetch(`${baseUrl}/restaurants/me`);
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logged.filter((line) => line.startsWith('[webhook]'))).toEqual([]);
  });
});
