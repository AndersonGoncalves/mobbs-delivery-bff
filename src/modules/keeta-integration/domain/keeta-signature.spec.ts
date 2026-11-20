import { buildKeetaAuthorizationState, computeKeetaSignature, verifyKeetaSignature } from './keeta-signature';

describe('computeKeetaSignature/verifyKeetaSignature', () => {
  it('calcula a mesma assinatura pra params em ordens diferentes (ordenação ASCII interna)', () => {
    const a = computeKeetaSignature('https://open.mykeeta.com/order/confirm', { shopId: '1', orderViewId: '2' }, 'segredo');
    const b = computeKeetaSignature('https://open.mykeeta.com/order/confirm', { orderViewId: '2', shopId: '1' }, 'segredo');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('assinatura muda se qualquer parâmetro mudar', () => {
    const a = computeKeetaSignature('https://open.mykeeta.com/order/confirm', { shopId: '1' }, 'segredo');
    const b = computeKeetaSignature('https://open.mykeeta.com/order/confirm', { shopId: '2' }, 'segredo');
    expect(a).not.toBe(b);
  });

  it('verifyKeetaSignature aceita a assinatura correta e rejeita qualquer outra', () => {
    const url = 'https://open.mykeeta.com/webhooks/keeta';
    const params = { eventType: '1001', shopId: '123' };
    const sig = computeKeetaSignature(url, params, 'segredo');

    expect(verifyKeetaSignature(url, params, 'segredo', sig)).toBe(true);
    expect(verifyKeetaSignature(url, params, 'segredo', 'assinatura-errada')).toBe(false);
    expect(verifyKeetaSignature(url, params, 'segredo', undefined)).toBe(false);
  });
});

describe('buildKeetaAuthorizationState', () => {
  it('gera um nonce opaco, diferente a cada chamada', () => {
    const a = buildKeetaAuthorizationState();
    const b = buildKeetaAuthorizationState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
  });
});
