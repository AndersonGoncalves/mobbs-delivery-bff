import { ConflictError } from 'restify-errors';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IOrderItem } from '../entities/order.entity';
import { StockReservationService } from './stock-reservation.service';

function buildItem(overrides: Partial<IOrderItem> = {}): IOrderItem {
  return {
    id: 'item-1', productId: 'product-main', productName: 'Pizza', quantity: 2, unitPrice: 25,
    selections: [], ...overrides,
  };
}

describe('StockReservationService (specs/0108)', () => {
  function setup() {
    const productRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => ({
        id, restaurantId: 'r-1', tracksStock: true, stockQuantity: 10,
      })),
      decrementStockIfAvailable: jest.fn().mockResolvedValue(true),
      restoreStock: jest.fn().mockResolvedValue(true),
    } as unknown as IProductRepository;
    const rawMaterialRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => ({
        id, restaurantId: 'r-1', tracksStock: true, currentStock: 10,
      })),
      decrementStockIfAvailable: jest.fn().mockResolvedValue(true),
      incrementStock: jest.fn().mockResolvedValue({}),
    } as unknown as IRawMaterialRepository;
    const operations = new Map<string, { id: string; quantity: number; type: string }>();
    const movementRepository = {
      findByOperationId: jest.fn().mockImplementation(async (_restaurantId: string, operationId: string) => operations.get(operationId) ?? null),
      create: jest.fn().mockImplementation(async (input: { operationId: string; quantity: number; type: string }) => {
        const movement = { id: `movement-${operations.size + 1}`, ...input };
        operations.set(input.operationId, movement);
        return movement;
      }),
    } as unknown as IStockMovementRepository;
    const service = new StockReservationService(productRepository, rawMaterialRepository, movementRepository);
    return { productRepository, rawMaterialRepository, movementRepository, operations, service };
  }

  it('reserves main product and nested product/raw-material options multiplied by parent quantity', async () => {
    const { productRepository, rawMaterialRepository, service } = setup();
    const item = buildItem({ selections: [{
      groupName: 'Tamanho', optionName: 'Grande', priceDelta: 0, linkedProductId: 'product-drink',
      rawMaterialId: 'raw-cheese',
      nestedSelections: [{ groupName: 'Extra', optionName: 'Bacon', priceDelta: 0, rawMaterialId: 'raw-bacon' }],
    }] });

    const [reserved] = await service.reserveOrderItems('r-1', [item], true, 'order-1', 'request-1');

    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('product-main', 2);
    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('product-drink', 2);
    expect(rawMaterialRepository.decrementStockIfAvailable).toHaveBeenCalledWith('raw-cheese', 2);
    expect(rawMaterialRepository.decrementStockIfAvailable).toHaveBeenCalledWith('raw-bacon', 2);
    expect(reserved.stockReservations).toHaveLength(4);
  });

  it('does nothing when restaurant stock control is disabled', async () => {
    const { productRepository, service } = setup();

    const [unchanged] = await service.reserveOrderItems('r-1', [buildItem()], false, 'order-1', 'request-1');

    expect(productRepository.decrementStockIfAvailable).not.toHaveBeenCalled();
    expect(unchanged.stockReservations).toBeUndefined();
  });

  it('compensates earlier resources when a later resource cannot be reserved', async () => {
    const { productRepository, rawMaterialRepository, service } = setup();
    (rawMaterialRepository.decrementStockIfAvailable as jest.Mock).mockResolvedValue(false);
    const item = buildItem({ selections: [{ groupName: 'Extra', optionName: 'Queijo', priceDelta: 0, rawMaterialId: 'raw-cheese' }] });

    await expect(service.reserveOrderItems('r-1', [item], true, 'order-1', 'request-1')).rejects.toBeInstanceOf(ConflictError);

    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('product-main', 2);
    expect(productRepository.restoreStock).toHaveBeenCalledWith('product-main', 2);
  });

  it('restores each reservation at most once on repeated cancellation', async () => {
    const { productRepository, service } = setup();
    const [reserved] = await service.reserveOrderItems('r-1', [buildItem()], true, 'order-1', 'request-1');

    await service.releaseOrderReservations('r-1', 'order-1', [reserved]);
    await service.releaseOrderReservations('r-1', 'order-1', [reserved]);

    expect(productRepository.restoreStock).toHaveBeenCalledTimes(1);
    expect(productRepository.restoreStock).toHaveBeenCalledWith('product-main', 2);
  });

  it('releases only reservations not attached to a concurrent idempotent order', async () => {
    const { productRepository, service } = setup();
    const shared = { resourceType: 'product' as const, resourceId: 'product-main', unitsPerItem: 1, quantity: 2, operationId: 'shared' };
    const orphan = { resourceType: 'product' as const, resourceId: 'product-extra', unitsPerItem: 1, quantity: 2, operationId: 'orphan' };

    await service.releaseReservationsNotAttachedToOrder(
      'r-1',
      'losing-order',
      [buildItem({ stockReservations: [shared, orphan] })],
      [buildItem({ stockReservations: [shared] })],
    );

    expect(productRepository.restoreStock).toHaveBeenCalledTimes(1);
    expect(productRepository.restoreStock).toHaveBeenCalledWith('product-extra', 2);
  });
});
