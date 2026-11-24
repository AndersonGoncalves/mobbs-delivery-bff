import type { Request, Response, Server } from 'restify';

/**
 * specs/0215-ambiente-homologacao T019 — o QA acompanha os logs da API (SSH só-leitura) pra saber
 * se os webhooks dos parceiros (Asaas, Mercado Pago, Uber, 99Food, Keeta, FocusNFe...) chegaram e
 * qual erro aconteceu. Antes, Mercado Pago/Uber não logavam nada, webhook recusado (4xx) não
 * ficava registrado em lugar nenhum e erro 500 ia só pro Sentry.
 *
 * O que NUNCA vai pro log: corpo, cabeçalhos e query string da requisição. A query sai de
 * propósito — o webhook da Uber leva o token de autenticação em `?token=`.
 */

const WEBHOOK_PREFIX = '/webhooks/';
const MAX_MESSAGE_LENGTH = 200;

/** Caminho sem query string (defensivo: o `getPath()` do Restify já vem sem, mas o token da Uber
 * não pode vazar nem se isso mudar numa versão futura). */
export function pathWithoutQuery(rawPath: string): string {
  const index = rawPath.indexOf('?');
  return index === -1 ? rawPath : rawPath.slice(0, index);
}

export function isWebhookPath(path: string): boolean {
  return pathWithoutQuery(path).startsWith(WEBHOOK_PREFIX);
}

/** Mensagem de erro numa linha só e curta — evita quebrar o log e despejar texto enorme. */
export function sanitizeLogMessage(message: string): string {
  const singleLine = message.replace(/\s+/g, ' ').trim();
  return singleLine.length > MAX_MESSAGE_LENGTH ? `${singleLine.slice(0, MAX_MESSAGE_LENGTH)}…` : singleLine;
}

export function formatWebhookLogLine(input: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  errorMessage?: string;
}): string {
  const base = `[webhook] ${input.method} ${pathWithoutQuery(input.path)} → ${input.statusCode} (${Math.max(0, Math.round(input.durationMs))}ms)`;
  return input.errorMessage ? `${base} ${sanitizeLogMessage(input.errorMessage)}` : base;
}

export function formatServerErrorLogLine(input: { method: string; path: string; errorName: string; errorMessage: string }): string {
  return `[erro 500] ${input.method} ${pathWithoutQuery(input.path)} — ${input.errorName}: ${sanitizeLogMessage(input.errorMessage)}`;
}

/** Uma linha por chamada a `/webhooks/*`, no fim do ciclo da requisição (inclui 4xx/5xx e
 * rejeições de middleware, como rate limit e token inválido). */
export function registerWebhookRequestLog(application: Server): void {
  application.on('after', (req: Request, res: Response, _route: unknown, err?: Error) => {
    const path = req.getPath();
    if (!isWebhookPath(path)) return;
    const line = formatWebhookLogLine({
      method: req.method ?? 'POST',
      path,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.time(),
      errorMessage: err?.message,
    });
    if (res.statusCode >= 400) {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  });
}
