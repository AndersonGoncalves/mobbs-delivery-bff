import { validateDraftForFinalize } from './validate-draft-for-finalize';

const oneItem = [{ id: 'i1', productId: 'p1', productName: 'X', quantity: 1, unitPrice: 10 }];

describe('validateDraftForFinalize (specs/0174-pdv-extensao-chrome-lateral AC-9)', () => {
  it('rejeita rascunho sem itens', () => {
    expect(() => validateDraftForFinalize({ modality: 'counter', items: [], paymentMethod: 'cash' })).toThrow(
      'Adicione ao menos um item',
    );
  });

  it('rejeita sem forma de pagamento', () => {
    expect(() => validateDraftForFinalize({ modality: 'counter', items: oneItem })).toThrow('forma de pagamento');
  });

  it('balcão: aceita sem nenhuma identificação de cliente', () => {
    expect(() => validateDraftForFinalize({ modality: 'counter', items: oneItem, paymentMethod: 'cash' })).not.toThrow();
  });

  it('retirada: exige nome e telefone, mas não endereço', () => {
    expect(() =>
      validateDraftForFinalize({ modality: 'pickup', items: oneItem, paymentMethod: 'cash', customerName: 'Ana', customerPhone: '5511999999999' }),
    ).not.toThrow();
  });

  it('retirada: rejeita sem telefone', () => {
    expect(() => validateDraftForFinalize({ modality: 'pickup', items: oneItem, paymentMethod: 'cash', customerName: 'Ana' })).toThrow(
      'telefone',
    );
  });

  it('delivery: exige nome, telefone e endereço', () => {
    expect(() =>
      validateDraftForFinalize({
        modality: 'delivery',
        items: oneItem,
        paymentMethod: 'cash',
        customerName: 'Ana',
        customerPhone: '5511999999999',
        deliveryAddress: 'Rua X, 123',
      }),
    ).not.toThrow();
  });

  it('delivery: rejeita sem endereço', () => {
    expect(() =>
      validateDraftForFinalize({ modality: 'delivery', items: oneItem, paymentMethod: 'cash', customerName: 'Ana', customerPhone: '5511999999999' }),
    ).toThrow('endereço');
  });
});
