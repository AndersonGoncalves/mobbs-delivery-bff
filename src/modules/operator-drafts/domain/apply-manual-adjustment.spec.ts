import { applyManualAdjustment } from './apply-manual-adjustment';

describe('applyManualAdjustment (specs/0174-pdv-extensao-chrome-lateral)', () => {
  it('sem ajuste, devolve o total base', () => {
    expect(applyManualAdjustment(55)).toBe(55);
  });

  it('AC-12: subtotal 50 + frete 5 = 55, desconto fixo de 10 -> 45', () => {
    const total = applyManualAdjustment(55, { type: 'discount', mode: 'fixed', value: 10 });
    expect(total).toBe(45);
  });

  it('acréscimo percentual soma sobre a base', () => {
    const total = applyManualAdjustment(100, { type: 'surcharge', mode: 'percent', value: 10 });
    expect(total).toBe(110);
  });

  it('desconto percentual soma sobre a base', () => {
    const total = applyManualAdjustment(100, { type: 'discount', mode: 'percent', value: 25 });
    expect(total).toBe(75);
  });

  it('AC-12: total negativo é rejeitado, nunca truncado em silêncio', () => {
    expect(() => applyManualAdjustment(10, { type: 'discount', mode: 'fixed', value: 50 })).toThrow(
      'O ajuste manual não pode deixar o total negativo',
    );
  });

  it('desconto igual ao total resulta em zero, permitido', () => {
    expect(applyManualAdjustment(10, { type: 'discount', mode: 'fixed', value: 10 })).toBe(0);
  });
});
