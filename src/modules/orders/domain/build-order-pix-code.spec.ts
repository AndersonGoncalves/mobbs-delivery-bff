import { buildOrderPixCode } from './build-order-pix-code';

const restaurant = { name: 'Prime Pizza', pixKey: '81507020325', pixBeneficiaryName: 'Prime Pizza LTDA', address: { city: 'Fortaleza' } } as Parameters<
  typeof buildOrderPixCode
>[0];

describe('buildOrderPixCode (specs/0069)', () => {
  it('gera o BR Code do pedido quando é Pix e o restaurante tem chave', () => {
    const code = buildOrderPixCode(restaurant, { id: 'o-1', total: 59, paymentMethod: 'pix' });

    expect(code).toMatch(/^000201/);
    expect(code).toContain('br.gov.bcb.pix');
    expect(code).toContain('59.00');
  });

  it('undefined quando a forma de pagamento não é Pix', () => {
    expect(buildOrderPixCode(restaurant, { id: 'o-1', total: 59, paymentMethod: 'cash' })).toBeUndefined();
  });

  it('undefined quando o restaurante não tem chave Pix', () => {
    expect(buildOrderPixCode({ ...restaurant, pixKey: undefined }, { id: 'o-1', total: 59, paymentMethod: 'pix' })).toBeUndefined();
  });
});
