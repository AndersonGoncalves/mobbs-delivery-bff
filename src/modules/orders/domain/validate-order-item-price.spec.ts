import { IProduct, IProductAdditionalGroup } from '../../catalog/domain/entities/product.entity';
import { computeExpectedItemUnitPrice, findOrderItemPriceMismatches } from './validate-order-item-price';

function buildGroups(): IProductAdditionalGroup[] {
  return [
    {
      id: 'g-1',
      productId: 'p-1',
      name: 'Bebidas do combo',
      type: 'adicionar',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'o-1', groupId: 'g-1', name: 'Coca-Cola 1L', priceDelta: 8 },
        { id: 'o-2', groupId: 'g-1', name: 'Guaraná 1L', priceDelta: 6 },
      ],
    },
    {
      id: 'g-remover',
      productId: 'p-1',
      name: 'Retirar',
      type: 'remover',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [{ id: 'o-queijo', groupId: 'g-remover', name: 'Queijo', priceDelta: 0 }],
    },
  ];
}

function buildProduct(overrides: Partial<IProduct> = {}): IProduct {
  return {
    id: 'p-1',
    restaurantId: 'r-1',
    menuCategoryId: 'cat-1',
    name: 'Combo Família',
    price: 50,
    isAvailable: true,
    additionalGroups: buildGroups(),
    isFeatured: false,
    featuredOrder: 0,
    availableAsAdditional: false,
    ...overrides,
  } as IProduct;
}

// Achado crítico da auditoria pré-produção (31/10/2026) — "preço do pedido nunca é revalidado
// contra o catálogo real". `unitPrice` já inclui adicionais (ver comentário em
// `computeOrderPricing`), por isso o preço esperado é base + soma real dos `priceDelta`
// casados por nome, nunca `product.price` isolado.
describe('computeExpectedItemUnitPrice (achado de auditoria 2026-10-31)', () => {
  it('sem seleção, preço esperado é só o preço base do produto', () => {
    expect(computeExpectedItemUnitPrice(buildProduct(), [])).toBe(50);
  });

  it('soma o priceDelta real da seleção casada por groupName/optionName', () => {
    const selections = [{ groupName: 'Bebidas do combo', optionName: 'Coca-Cola 1L', priceDelta: 8 }];
    expect(computeExpectedItemUnitPrice(buildProduct(), selections)).toBe(58);
  });

  it('usa promotionalPrice como base quando o produto está em promoção', () => {
    const product = buildProduct({ promotionalPrice: 40 });
    const selections = [{ groupName: 'Bebidas do combo', optionName: 'Guaraná 1L', priceDelta: 6 }];
    expect(computeExpectedItemUnitPrice(product, selections)).toBe(46);
  });

  it('ignora o priceDelta que o client mandou na seleção — usa o do catálogo, mesmo se o client mentir', () => {
    const selections = [{ groupName: 'Bebidas do combo', optionName: 'Coca-Cola 1L', priceDelta: 0 }];
    expect(computeExpectedItemUnitPrice(buildProduct(), selections)).toBe(58);
  });

  it('opção de grupo "remover" soma priceDelta 0, nunca vira desconto inventado', () => {
    const selections = [{ groupName: 'Retirar', optionName: 'Queijo', priceDelta: 0 }];
    expect(computeExpectedItemUnitPrice(buildProduct(), selections)).toBe(50);
  });

  it('seleção que não corresponde a nenhuma opção real (grupo/opção inventados) é preço indeterminável (null)', () => {
    const selections = [{ groupName: 'Grupo que não existe', optionName: 'Opção inventada', priceDelta: 999 }];
    expect(computeExpectedItemUnitPrice(buildProduct(), selections)).toBeNull();
  });

  it('resolve recursivamente nestedSelections (produto composto)', () => {
    const product = buildProduct({
      additionalGroups: [
        {
          id: 'g-sabor',
          productId: 'p-1',
          name: 'Sabores',
          type: 'adicionar',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            {
              id: 'o-mussarela',
              groupId: 'g-sabor',
              name: 'Mussarela',
              priceDelta: 0,
              nestedAdditionalGroups: [
                {
                  id: 'g-nested',
                  productId: 'p-1',
                  name: 'Ingredientes extra',
                  type: 'adicionar',
                  required: false,
                  minSelections: 0,
                  maxSelections: 1,
                  options: [{ id: 'o-bacon', groupId: 'g-nested', name: 'Bacon', priceDelta: 5 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const selections = [
      {
        groupName: 'Sabores',
        optionName: 'Mussarela',
        priceDelta: 0,
        nestedSelections: [{ groupName: 'Ingredientes extra', optionName: 'Bacon', priceDelta: 5 }],
      },
    ];
    expect(computeExpectedItemUnitPrice(product, selections)).toBe(55);
  });

  it('nestedSelection inventada também vira preço indeterminável (null), mesmo com a seleção de nível 1 válida', () => {
    const product = buildProduct({
      additionalGroups: [
        {
          id: 'g-sabor',
          productId: 'p-1',
          name: 'Sabores',
          type: 'adicionar',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-mussarela', groupId: 'g-sabor', name: 'Mussarela', priceDelta: 0, nestedAdditionalGroups: [] }],
        },
      ],
    });
    const selections = [
      {
        groupName: 'Sabores',
        optionName: 'Mussarela',
        priceDelta: 0,
        nestedSelections: [{ groupName: 'Ingredientes extra', optionName: 'Bacon', priceDelta: 5 }],
      },
    ];
    expect(computeExpectedItemUnitPrice(product, selections)).toBeNull();
  });
});

describe('findOrderItemPriceMismatches (achado de auditoria 2026-10-31)', () => {
  it('nenhum mismatch quando unitPrice de todos os itens bate com o preço real', () => {
    const product = buildProduct();
    const items = [{ id: 'i-1', productId: 'p-1', productName: 'Combo Família', quantity: 1, unitPrice: 50, selections: [] }];
    expect(findOrderItemPriceMismatches(items, new Map([['p-1', product]]))).toEqual([]);
  });

  it('reporta o item quando unitPrice enviado pelo client é menor que o preço real (tentativa de pagar menos)', () => {
    const product = buildProduct();
    const items = [{ id: 'i-1', productId: 'p-1', productName: 'Combo Família', quantity: 1, unitPrice: 1, selections: [] }];

    const mismatches = findOrderItemPriceMismatches(items, new Map([['p-1', product]]));

    expect(mismatches).toEqual([
      { itemId: 'i-1', productId: 'p-1', productName: 'Combo Família', sentUnitPrice: 1, expectedUnitPrice: 50 },
    ]);
  });

  it('productId ausente do mapa (produto apagado, ou de outro restaurante) também é mismatch, com expectedUnitPrice null', () => {
    const items = [{ id: 'i-1', productId: 'p-estranho', productName: 'Produto de outro restaurante', quantity: 1, unitPrice: 30, selections: [] }];

    const mismatches = findOrderItemPriceMismatches(items, new Map());

    expect(mismatches).toEqual([
      { itemId: 'i-1', productId: 'p-estranho', productName: 'Produto de outro restaurante', sentUnitPrice: 30, expectedUnitPrice: null },
    ]);
  });

  it('só reporta os itens divergentes, mantendo os corretos fora da lista', () => {
    const product = buildProduct();
    const items = [
      { id: 'i-1', productId: 'p-1', productName: 'Combo Família', quantity: 1, unitPrice: 50, selections: [] },
      { id: 'i-2', productId: 'p-1', productName: 'Combo Família', quantity: 2, unitPrice: 999, selections: [] },
    ];

    const mismatches = findOrderItemPriceMismatches(items, new Map([['p-1', product]]));

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].itemId).toBe('i-2');
  });
});
