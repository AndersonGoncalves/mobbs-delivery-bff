import { createHash, timingSafeEqual } from 'crypto';

/**
 * Achado de auditoria pré-produção (01/11/2026) — "comparação de token de webhook não é
 * constant-time": `token !== expected` (usado antes em todos os controllers de webhook) retorna
 * no primeiro byte diferente — um atacante medindo o tempo de resposta pode, em teoria, descobrir
 * o token caractere por caractere. Hasheia os dois lados pra um tamanho fixo (sha256, 32 bytes)
 * antes de comparar com `timingSafeEqual` — evita tanto o vazamento de timing quanto o erro que
 * `timingSafeEqual` lançaria se os dois `Buffer`s de entrada tivessem tamanhos diferentes.
 */
export function isValidWebhookToken(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}
