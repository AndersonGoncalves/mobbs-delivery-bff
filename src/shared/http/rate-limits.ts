import { buildRateLimitMiddleware } from './rate-limit.middleware';

/**
 * Achado de auditoria (06/11/2026, implementado 09/11/2026) — instâncias compartilhadas (um
 * `Map`/contador por IP cada, não por rota): um totem físico chama várias rotas de totem ao longo
 * do uso normal (cardápio, criar pedido, recibo), então o orçamento é por dispositivo, não por
 * endpoint; o mesmo vale pros webhooks, cada provedor sempre chama só a própria rota, então
 * compartilhar o contador entre os 6 webhooks não mistura tráfego de provedores diferentes (IPs
 * diferentes).
 *
 * Totem: 60 requisições / 10s (6/s sustentado) — generoso o bastante pro uso normal (cardápio
 * recarregado, pedidos criados, recibo consultado), apertado o bastante pra barrar um flood.
 * Webhook: 20 requisições / 10s (2/s sustentado) — nenhum provedor real entrega webhook nessa
 * frequência; picos legítimos (reenvio em lote depois de uma instabilidade) cabem na janela.
 */
export const totemRateLimitMiddleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 60 });
export const webhookRateLimitMiddleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 20 });
