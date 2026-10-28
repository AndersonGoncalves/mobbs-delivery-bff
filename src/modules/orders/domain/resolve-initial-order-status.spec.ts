import { resolveInitialOrderStatus } from './resolve-initial-order-status';

describe('resolveInitialOrderStatus', () => {
  it('Pix nunca nasce confirmado, mesmo com autoConfirmPaymentMethods incluindo pix', () => {
    const status = resolveInitialOrderStatus('pix', { autoConfirmPaymentMethods: ['pix'] });
    expect(status).toBeUndefined();
  });

  it('creditCardOnline nunca nasce confirmado, mesmo com autoConfirmPaymentMethods incluindo', () => {
    const status = resolveInitialOrderStatus('creditCardOnline', { autoConfirmPaymentMethods: ['creditCardOnline'] });
    expect(status).toBeUndefined();
  });

  it('cash nasce confirmado quando o restaurante configurou autoConfirmPaymentMethods com cash (specs/0151)', () => {
    const status = resolveInitialOrderStatus('cash', { autoConfirmPaymentMethods: ['cash'] });
    expect(status).toBe('confirmado');
  });

  it('cash nasce aguardandoConfirmacao (undefined) quando não está em autoConfirmPaymentMethods', () => {
    const status = resolveInitialOrderStatus('cash', { autoConfirmPaymentMethods: [] });
    expect(status).toBeUndefined();
  });

  it('sem autoConfirmPaymentMethods configurado, nenhuma forma confirma sozinha', () => {
    const status = resolveInitialOrderStatus('cash', { autoConfirmPaymentMethods: undefined });
    expect(status).toBeUndefined();
  });
});
