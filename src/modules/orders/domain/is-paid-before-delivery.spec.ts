import { isPaidBeforeDelivery } from './is-paid-before-delivery';

describe('isPaidBeforeDelivery (specs/0213 + specs/0234)', () => {
  it('Pix é pago antes da entrega', () => {
    expect(isPaidBeforeDelivery({ paymentMethod: 'pix' })).toBe(true);
  });

  it('AC-1: cartão online do app do cliente (sem source, Mercado Pago) é pago antes da entrega', () => {
    expect(isPaidBeforeDelivery({ paymentMethod: 'creditCardOnline' })).toBe(true);
  });

  it.each(['ifood', '99food', 'keeta'] as const)('AC-5: cartão online do %s continua na entrega', (source) => {
    expect(isPaidBeforeDelivery({ paymentMethod: 'creditCardOnline', source })).toBe(false);
  });

  it.each(['cash', 'creditCard', 'debitCard'] as const)('%s continua na entrega', (paymentMethod) => {
    expect(isPaidBeforeDelivery({ paymentMethod })).toBe(false);
  });
});
