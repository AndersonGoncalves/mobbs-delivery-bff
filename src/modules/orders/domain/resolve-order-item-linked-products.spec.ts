import { IProductAdditionalGroup } from '../../catalog/domain/entities/product.entity';
import { resolveOrderItemLinkedProducts } from './resolve-order-item-linked-products';

function buildGroups(overrides: Partial<IProductAdditionalGroup>[] = []): IProductAdditionalGroup[] {
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
        { id: 'o-1', groupId: 'g-1', name: 'Coca-Cola 1L', priceDelta: -2, linkedProductId: 'prod-coca' },
        { id: 'o-2', groupId: 'g-1', name: 'Guaraná 1L', priceDelta: -2 },
      ],
    },
    ...overrides,
  ] as IProductAdditionalGroup[];
}

describe('resolveOrderItemLinkedProducts (specs/0047 REQ-16)', () => {
  it('AC-16: resolve linkedProductId casando groupName/optionName contra a árvore atual do produto', () => {
    const selections = [{ groupName: 'Bebidas do combo', optionName: 'Coca-Cola 1L', priceDelta: -2 }];

    const resolved = resolveOrderItemLinkedProducts(selections, buildGroups());

    expect(resolved[0].linkedProductId).toBe('prod-coca');
  });

  it('opção sem linkedProductId no catálogo fica sem linkedProductId na seleção', () => {
    const selections = [{ groupName: 'Bebidas do combo', optionName: 'Guaraná 1L', priceDelta: -2 }];

    const resolved = resolveOrderItemLinkedProducts(selections, buildGroups());

    expect(resolved[0].linkedProductId).toBeUndefined();
  });

  it('grupo/opção não encontrados (renomeado ou removido) não quebra, só fica sem linkedProductId', () => {
    const selections = [{ groupName: 'Grupo que não existe mais', optionName: 'Opção sumida', priceDelta: 0 }];

    const resolved = resolveOrderItemLinkedProducts(selections, buildGroups());

    expect(resolved[0].linkedProductId).toBeUndefined();
    expect(resolved[0].groupName).toBe('Grupo que não existe mais');
  });

  it('resolve recursivamente em nestedSelections (produto composto)', () => {
    const groups: IProductAdditionalGroup[] = [
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
                options: [{ id: 'o-bacon', groupId: 'g-nested', name: 'Bacon', priceDelta: 5, linkedProductId: 'prod-bacon' }],
              },
            ],
          },
        ],
      },
    ];
    const selections = [
      {
        groupName: 'Sabores',
        optionName: 'Mussarela',
        priceDelta: 0,
        nestedSelections: [{ groupName: 'Ingredientes extra', optionName: 'Bacon', priceDelta: 5 }],
      },
    ];

    const resolved = resolveOrderItemLinkedProducts(selections, groups);

    expect(resolved[0].nestedSelections?.[0].linkedProductId).toBe('prod-bacon');
  });
});
