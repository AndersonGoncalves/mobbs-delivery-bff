import { createHash } from 'crypto';
import jsonBigint from 'json-bigint';

/**
 * specs/0122-integracao-99food — verificação do webhook (`Authentication & Signature Mechanism`,
 * `plan.md`): `didi-header-sign` = MD5(corpo_raw_do_POST + app_secret). Precisa do corpo raw
 * EXATO (não o `req.body` já re-serializado pelo `JSON.stringify`, que poderia diferir em
 * formatação/ordem de campos do que a 99Food realmente enviou) — Restify guarda isso em
 * `req.rawBody` antes do `JSON.parse` (`jsonBodyParser.js:30`).
 */
export function verifyNinetyNineFoodSignature(rawBody: string, appSecret: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = createHash('md5').update(rawBody + appSecret).digest('hex');
  return expected === signatureHeader;
}

const parseBigIntSafe = jsonBigint({ storeAsString: true });

/**
 * specs/0122-integracao-99food — `app_id`/`order_id`/`shop_id` são inteiros de 64 bits (19
 * dígitos); o `JSON.parse` padrão (usado pelo `bodyParser` global do Restify em `req.body`)
 * perde precisão nesses valores — documentado pela própria 99Food (`plan.md`, "CRÍTICO"). Sempre
 * reparsear `req.rawBody` com isto em vez de usar `req.body` nos campos desse tipo.
 */
export function parseNinetyNineFoodWebhookBody(rawBody: string): unknown {
  return parseBigIntSafe.parse(rawBody);
}
