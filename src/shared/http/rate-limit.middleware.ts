import type { Request } from 'restify';
import { TooManyRequestsError } from 'restify-errors';

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

/**
 * Achado de auditoria (06/11/2026, confirmado e implementado 09/11/2026) — rate limiting em
 * memória (janela fixa por IP) pras rotas sem Firebase por trás: totem (`X-Totem-Api-Key`) e os 6
 * webhooks (token comparado ou assinatura HMAC). Login via Firebase não precisa disso — o client
 * SDK fala direto com a Google, que já tem rate limiting nativo por fora.
 *
 * Instância única (t3.micro, 1 container) — sem necessidade de um backend compartilhado tipo
 * Redis; o estado em memória se perde num restart do processo, o que é aceitável aqui (o risco
 * que isso mitiga é um flood sustentado, não uma janela de alguns segundos logo após reiniciar).
 *
 * Cada chamada de `buildRateLimitMiddleware` cria seu próprio `Map` isolado (janelas diferentes
 * por grupo de rota não competem entre si) e seu próprio timer de limpeza periódica, pra não
 * crescer sem limite com IPs que só aparecem uma vez (ex. bots escaneando a internet).
 */
export function buildRateLimitMiddleware(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, RateLimitBucket>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= options.windowMs) buckets.delete(key);
    }
  }, options.windowMs);
  cleanup.unref();

  return async function rateLimitMiddleware(req: Request): Promise<void> {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'desconhecido';
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      buckets.set(ip, { count: 1, windowStart: now });
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      throw new TooManyRequestsError('Muitas tentativas — aguarde um momento e tente de novo');
    }
  };
}
