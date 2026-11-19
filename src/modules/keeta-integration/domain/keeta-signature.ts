import { createHash, randomBytes } from 'crypto';

/**
 * specs/0212-integracao-keeta — assinatura `sig` exigida em TODA requisição à API da Keeta e em
 * todo webhook recebido (`plan.md`, "Resumo da API real"): `SHA256(URL + string_ordenada_ASCII_
 * dos_params("key=value&...") + appSecret)`, 64 chars hex. Parâmetros vazios entram no cálculo;
 * valores JSON não são reordenados internamente; upload de imagem (multipart) fica fora do
 * cálculo — não se aplica aqui, nenhum endpoint usado nesta spec sobe arquivo.
 */
export function computeKeetaSignature(url: string, params: Record<string, string>, appSecret: string): string {
  const sortedParams = Object.keys(params)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha256').update(url + sortedParams + appSecret).digest('hex');
}

export function verifyKeetaSignature(url: string, params: Record<string, string>, appSecret: string, receivedSignature: string | undefined): boolean {
  if (!receivedSignature) return false;
  const expected = computeKeetaSignature(url, params, appSecret);
  return expected === receivedSignature;
}

/**
 * specs/0212-integracao-keeta — o `state` do OAuth2 (REQ-1/REQ-2) é um nonce opaco aleatório,
 * persistido em `Restaurant.keetaAuthorizationState` ao gerar o link
 * (`markKeetaAuthorizationPending`) e resolvido de volta por busca direta no banco
 * (`findByKeetaAuthorizationState`) quando o callback chega — diferente do matching FIFO que o
 * 99Food precisa usar (a Keeta não dá como "escolher o restaurante" no momento de gerar o link),
 * aqui o `state` já resolve isso de forma determinística, sem precisar embutir/assinar o
 * `restaurantId` nele.
 */
export function buildKeetaAuthorizationState(): string {
  return randomBytes(24).toString('hex');
}
