import { createHash } from 'crypto';
import { parseNinetyNineFoodWebhookBody, verifyNinetyNineFoodSignature } from './ninety-nine-food-webhook-verifier';

describe('verifyNinetyNineFoodSignature (specs/0122-integracao-99food)', () => {
  it('aceita quando a assinatura bate (MD5 do corpo raw + app_secret)', () => {
    const rawBody = '{"type":"orderNew"}';
    const appSecret = 'secret-1';
    const signature = createHash('md5').update(rawBody + appSecret).digest('hex');

    expect(verifyNinetyNineFoodSignature(rawBody, appSecret, signature)).toBe(true);
  });

  it('rejeita quando a assinatura não bate', () => {
    expect(verifyNinetyNineFoodSignature('{"type":"orderNew"}', 'secret-1', 'assinatura-errada')).toBe(false);
  });

  it('rejeita quando não há header de assinatura', () => {
    expect(verifyNinetyNineFoodSignature('{"type":"orderNew"}', 'secret-1', undefined)).toBe(false);
  });

  it('rejeita quando o corpo raw foi alterado (mesmo com a assinatura certa pro corpo original)', () => {
    const originalBody = '{"type":"orderNew","data":{"order_id":1}}';
    const appSecret = 'secret-1';
    const signature = createHash('md5').update(originalBody + appSecret).digest('hex');
    const tamperedBody = '{"type":"orderNew","data":{"order_id":2}}';

    expect(verifyNinetyNineFoodSignature(tamperedBody, appSecret, signature)).toBe(false);
  });
});

describe('parseNinetyNineFoodWebhookBody (specs/0122-integracao-99food — precisão de inteiros de 64 bits)', () => {
  it('preserva order_id de 19 dígitos como string exata (JSON.parse padrão perderia precisão)', () => {
    const rawBody = '{"order_id":5764656197621845665,"type":"orderNew"}';

    const parsed = parseNinetyNineFoodWebhookBody(rawBody) as { order_id: string; type: string };

    expect(parsed.order_id).toBe('5764656197621845665');
    expect(typeof parsed.order_id).toBe('string');
    // Prova que o JSON.parse nativo realmente perderia essa precisão (comparando como texto —
    // o literal numérico 5764656197621845665 em código já seria arredondado pelo próprio V8
    // antes mesmo de chegar ao JSON.parse, então a prova precisa reparsear o MESMO raw string).
    expect(String((JSON.parse(rawBody) as { order_id: number }).order_id)).not.toBe('5764656197621845665');
  });

  it('mantém campos pequenos (string/number comuns) intactos', () => {
    const rawBody = '{"app_shop_id":"xyz","timestamp":1592970557,"type":"shopBindStatus"}';

    const parsed = parseNinetyNineFoodWebhookBody(rawBody) as { app_shop_id: string; timestamp: number; type: string };

    expect(parsed).toEqual({ app_shop_id: 'xyz', timestamp: 1592970557, type: 'shopBindStatus' });
  });
});
