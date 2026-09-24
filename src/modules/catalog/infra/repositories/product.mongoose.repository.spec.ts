import { IProductAdditionalGroup, IProductAdditionalOption } from '../../domain/entities/product.entity';
import { IPromotion } from '../../../promotions/domain/entities/promotion.entity';
import { AdditionalGroupTemplateLeanDocument, resolveGroup, resolveOptionLinkedProduct } from './product.mongoose.repository';

function buildLinkedProduct(overrides: Partial<{ _id: string; name: string; imageUrl?: string; price: number }> = {}) {
  return { _id: 'prod-coca', name: 'Coca-Cola 1L', price: 10, ...overrides };
}

function buildPromotion(overrides: Partial<IPromotion> = {}): IPromotion {
  return {
    id: 'promo-1',
    restaurantId: 'r-1',
    name: 'Promoção',
    discountPercentage: 20,
    productIds: ['prod-coca'],
    isActive: true,
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function buildGroup(overrides: Partial<IProductAdditionalGroup> = {}): IProductAdditionalGroup {
  return {
    id: 'g-1',
    productId: 'p-1',
    name: 'BORDAS (snapshot antigo)',
    type: 'adicionar',
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [{ id: 'o-old', groupId: 'g-1', name: 'Opção antiga', priceDelta: 99 }],
    ...overrides,
  };
}

function buildTemplate(overrides: Partial<AdditionalGroupTemplateLeanDocument> = {}): AdditionalGroupTemplateLeanDocument {
  return {
    _id: 'tpl-1',
    name: 'BORDAS',
    type: 'adicionar',
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [{ id: 'o-1', name: 'Catupiry', priceDelta: 8 }],
    ...overrides,
  };
}

describe('resolveGroup (specs/0025-adicionais-reutilizaveis-remocao REQ-3)', () => {
  it('AC-2/AC-3: grupo sem templateId volta inalterado (grupo inline comum)', () => {
    const group = buildGroup({ templateId: undefined });

    expect(resolveGroup(group, new Map())).toBe(group);
  });

  it('AC-2/AC-3: grupo com templateId resolve pros dados ATUAIS do template, não pro snapshot salvo', () => {
    const group = buildGroup({ templateId: 'tpl-1', name: 'nome antigo qualquer' });
    const template = buildTemplate();
    const templatesById = new Map([['tpl-1', template]]);

    const resolved = resolveGroup(group, templatesById);

    expect(resolved.name).toBe('BORDAS');
    expect(resolved.required).toBe(true);
    expect(resolved.minSelections).toBe(1);
    expect(resolved.maxSelections).toBe(1);
    expect(resolved.options).toEqual([{ id: 'o-1', groupId: 'g-1', name: 'Catupiry', priceDelta: 8, rawMaterialId: undefined }]);
  });

  it('AC-2/AC-3: mantém id/productId/templateId do grupo do produto, nunca os do template', () => {
    const group = buildGroup({ id: 'g-do-produto', productId: 'p-do-produto', templateId: 'tpl-1' });
    const templatesById = new Map([['tpl-1', buildTemplate()]]);

    const resolved = resolveGroup(group, templatesById);

    expect(resolved.id).toBe('g-do-produto');
    expect(resolved.productId).toBe('p-do-produto');
    expect(resolved.templateId).toBe('tpl-1');
  });

  it('template desativado ainda resolve normalmente (isActive não é checado aqui — REQ-4 só impede novos vínculos)', () => {
    const group = buildGroup({ templateId: 'tpl-1' });
    const templatesById = new Map([['tpl-1', buildTemplate({ name: 'BORDAS (template desativado)' })]]);

    expect(resolveGroup(group, templatesById).name).toBe('BORDAS (template desativado)');
  });

  it('template apagado/não encontrado mantém o último snapshot conhecido, sem quebrar', () => {
    const group = buildGroup({ templateId: 'tpl-apagado' });

    expect(resolveGroup(group, new Map())).toBe(group);
  });

  // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — corrige
  // `specs/0029` REQ-3: a foto é de cada opção (resolvida do template atual), não do grupo.
  it('imageUrl de cada opção também é resolvida do template atual, não do snapshot salvo', () => {
    const group = buildGroup({ templateId: 'tpl-1' });
    const template = buildTemplate({ options: [{ id: 'o-1', name: 'Catupiry', priceDelta: 8, imageUrl: 'https://cdn.example.com/catupiry.png' }] });

    const resolved = resolveGroup(group, new Map([['tpl-1', template]]));

    expect(resolved.options[0].imageUrl).toBe('https://cdn.example.com/catupiry.png');
  });

  it('grupo type "remover" resolvido também vem do template (não do snapshot)', () => {
    const group = buildGroup({ templateId: 'tpl-1', type: 'adicionar' });
    const template = buildTemplate({
      type: 'remover',
      options: [{ id: 'o-1', name: 'Cebola', priceDelta: 0 }],
    });

    const resolved = resolveGroup(group, new Map([['tpl-1', template]]));

    expect(resolved.type).toBe('remover');
    expect(resolved.options[0].priceDelta).toBe(0);
  });
});

function buildOption(overrides: Partial<IProductAdditionalOption> = {}): IProductAdditionalOption {
  return { id: 'o-1', groupId: 'g-1', name: 'nome digitado na hora do vínculo', priceDelta: 3.5, ...overrides };
}

describe('resolveOptionLinkedProduct (specs/0041-item-adicional-vinculado-produto REQ-3)', () => {
  it('AC-4: opção sem linkedProductId volta inalterada', () => {
    const option = buildOption({ linkedProductId: undefined });

    expect(resolveOptionLinkedProduct(option, new Map())).toBe(option);
  });

  it('AC-4: opção com linkedProductId resolve name do produto vinculado ATUAL, não do snapshot salvo', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', name: 'nome antigo', imageUrl: 'https://cdn.example.com/propria.png' });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ imageUrl: 'https://cdn.example.com/coca.png' })]]);

    const resolved = resolveOptionLinkedProduct(option, productsById);

    expect(resolved.name).toBe('Coca-Cola 1L');
  });

  // specs/0056-preco-adicional-vinculado-sincroniza-produto (follow-up) — bug real: diferente de
  // name/priceDelta, imageUrl NÃO é forçado a partir do produto vinculado na leitura — senão uma
  // foto própria enviada pelo operador pra opção seria descartada no próximo carregamento.
  it('imageUrl NÃO é sobrescrito pelo produto vinculado — mantém a foto própria salva na opção', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', imageUrl: 'https://cdn.example.com/propria.png' });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ imageUrl: 'https://cdn.example.com/coca.png' })]]);

    expect(resolveOptionLinkedProduct(option, productsById).imageUrl).toBe('https://cdn.example.com/propria.png');
  });

  it('opção vinculada sem imageUrl própria continua sem imagem (não herda a do produto)', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', imageUrl: undefined });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ imageUrl: 'https://cdn.example.com/coca.png' })]]);

    expect(resolveOptionLinkedProduct(option, productsById).imageUrl).toBeUndefined();
  });

  // specs/0044-promocoes-produtos (follow-up) — "opção B": priceDelta de uma opção vinculada
  // nunca é digitado nem persistido (schema garante isso), é sempre resolvido a partir do
  // `price` ATUAL do produto vinculado — nunca do que estava salvo na opção antes do vínculo.
  it('priceDelta é resolvido a partir do price do produto vinculado, nunca do valor antigo salvo na opção', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', priceDelta: undefined });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ price: 12 })]]);

    expect(resolveOptionLinkedProduct(option, productsById).priceDelta).toBe(12);
  });

  // specs/0044-promocoes-produtos REQ-8/AC-8.
  it('AC-8: produto vinculado com promoção ativa desconta o priceDelta resolvido a partir do price atual', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', priceDelta: undefined });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ price: 10 })]]);
    const promotionsByProductId = new Map([['prod-coca', buildPromotion({ discountPercentage: 20 })]]);

    const resolved = resolveOptionLinkedProduct(option, productsById, promotionsByProductId);

    expect(resolved.priceDelta).toBe(8);
  });

  it('produto vinculado sem promoção ativa resolve priceDelta = price do produto, sem desconto', () => {
    const option = buildOption({ linkedProductId: 'prod-coca', priceDelta: undefined });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ price: 10 })]]);
    const promotionsByProductId = new Map([['prod-guarana', buildPromotion({ productIds: ['prod-guarana'] })]]);

    expect(resolveOptionLinkedProduct(option, productsById, promotionsByProductId).priceDelta).toBe(10);
  });

  it('AC-8: desconto de opção vinculada também resolve recursivamente dentro de nestedAdditionalGroups', () => {
    const option = buildOption({
      linkedProductId: undefined,
      nestedAdditionalGroups: [
        {
          id: 'g-nested',
          productId: 'p-1',
          name: 'Bebidas do combo',
          type: 'adicionar',
          required: false,
          minSelections: 0,
          maxSelections: 1,
          options: [buildOption({ id: 'o-nested', linkedProductId: 'prod-coca', priceDelta: undefined })],
        },
      ],
    });
    const productsById = new Map([['prod-coca', buildLinkedProduct({ price: 10 })]]);
    const promotionsByProductId = new Map([['prod-coca', buildPromotion({ discountPercentage: 20 })]]);

    const resolved = resolveOptionLinkedProduct(option, productsById, promotionsByProductId);

    expect(resolved.nestedAdditionalGroups?.[0].options[0].priceDelta).toBe(8);
  });

  it('produto vinculado apagado/não encontrado mantém o último snapshot conhecido, sem quebrar', () => {
    const option = buildOption({ linkedProductId: 'prod-apagado', name: 'Coca-Cola 1L (snapshot)' });

    const resolved = resolveOptionLinkedProduct(option, new Map());

    expect(resolved.name).toBe('Coca-Cola 1L (snapshot)');
  });

  it('resolve recursivamente dentro de nestedAdditionalGroups (produto composto)', () => {
    const option = buildOption({
      linkedProductId: undefined,
      nestedAdditionalGroups: [
        {
          id: 'g-nested',
          productId: 'p-1',
          name: 'Bebidas do combo',
          type: 'adicionar',
          required: false,
          minSelections: 0,
          maxSelections: 1,
          options: [buildOption({ id: 'o-nested', linkedProductId: 'prod-coca', name: 'antigo' })],
        },
      ],
    });
    const productsById = new Map([['prod-coca', buildLinkedProduct()]]);

    const resolved = resolveOptionLinkedProduct(option, productsById);

    expect(resolved.nestedAdditionalGroups?.[0].options[0].name).toBe('Coca-Cola 1L');
  });
});
