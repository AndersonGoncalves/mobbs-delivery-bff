import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { DeductStockForDeliveredOrderUseCase } from './deduct-stock-for-delivered-order.use-case';
import { IOrder } from './entities/order.entity';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 42,
    trackingToken: 'tok',
    customerId: 'cu-1',
    restaurantId: 'r-1',
    items: [],
    orderType: 'delivery',
    status: 'entregue',
    statusHistory: [],
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    total: 0,
    paymentMethod: 'pix',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DeductStockForDeliveredOrderUseCase (specs/0047 REQ-16)', () => {
  function setup() {
    const productRepository = { decrementStock: jest.fn().mockResolvedValue(true) } as unknown as IProductRepository;
    const stockMovementRepository = { create: jest.fn().mockResolvedValue({}) } as unknown as IStockMovementRepository;
    const useCase = new DeductStockForDeliveredOrderUseCase(productRepository, stockMovementRepository);
    return { productRepository, stockMovementRepository, useCase };
  }

  it('AC-16: baixa o estoque do produto principal de cada item', async () => {
    const { productRepository, stockMovementRepository, useCase } = setup();
    const order = buildOrder({
      items: [{ id: 'i-1', productId: 'p-coca', productName: 'Coca-Cola 1L', quantity: 2, unitPrice: 10 }],
    });

    await useCase.execute(order);

    expect(productRepository.decrementStock).toHaveBeenCalledWith('p-coca', 2);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', productId: 'p-coca', type: 'saida', quantity: 2, reason: expect.stringContaining('#42') }),
    );
  });

  it('AC-16: baixa também o produto vinculado (linkedProductId) de uma seleção, na quantidade do item pai', async () => {
    const { productRepository, useCase } = setup();
    const order = buildOrder({
      items: [
        {
          id: 'i-1',
          productId: 'p-combo',
          productName: 'Combo Família',
          quantity: 3,
          unitPrice: 60,
          selections: [{ groupName: 'Bebidas do combo', optionName: 'Coca-Cola 1L', priceDelta: -2, linkedProductId: 'p-coca' }],
        },
      ],
    });

    await useCase.execute(order);

    expect(productRepository.decrementStock).toHaveBeenCalledWith('p-combo', 3);
    expect(productRepository.decrementStock).toHaveBeenCalledWith('p-coca', 3);
  });

  it('não registra StockMovement quando o produto não tem stockQuantity controlado (decrementStock devolve false)', async () => {
    const { productRepository, stockMovementRepository, useCase } = setup();
    (productRepository.decrementStock as jest.Mock).mockResolvedValue(false);
    const order = buildOrder({ items: [{ id: 'i-1', productId: 'p-feito-na-hora', productName: 'Pizza', quantity: 1, unitPrice: 45 }] });

    await useCase.execute(order);

    expect(stockMovementRepository.create).not.toHaveBeenCalled();
  });

  it('resolve recursivamente em nestedSelections (produto composto)', async () => {
    const { productRepository, useCase } = setup();
    const order = buildOrder({
      items: [
        {
          id: 'i-1',
          productId: 'p-pizza',
          productName: 'Pizza',
          quantity: 1,
          unitPrice: 65,
          selections: [
            {
              groupName: 'Sabores',
              optionName: 'Mussarela',
              priceDelta: 0,
              nestedSelections: [{ groupName: 'Extras', optionName: 'Bacon', priceDelta: 5, linkedProductId: 'p-bacon' }],
            },
          ],
        },
      ],
    });

    await useCase.execute(order);

    expect(productRepository.decrementStock).toHaveBeenCalledWith('p-bacon', 1);
  });
});
