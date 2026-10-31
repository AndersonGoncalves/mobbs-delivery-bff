/**
 * Achado crítico da auditoria de performance pré-produção (31/10/2026) — "chamadas a
 * integrações externas sem timeout": nenhum client HTTP de integração (Asaas, Google Places,
 * iFood, Mercado Pago, Facebook, Uber Direct, 99Food, Focus NFe) configurava
 * `AbortSignal.timeout(...)` — se o serviço externo degradar, a requisição específica fica
 * pendurada por tempo potencialmente longo; em pico de pedidos durante uma instabilidade
 * externa, as requisições penduradas se acumulam e degradam a capacidade de resposta geral do
 * processo (único, atendendo todos os restaurantes). Wrapper único pra padronizar um timeout
 * curto em todo client novo ou existente, em vez de cada um reimplementar o próprio.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}
