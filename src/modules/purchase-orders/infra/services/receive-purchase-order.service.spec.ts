import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IPurchaseOrderRepository } from '../../domain/repositories/purchase-order.repository.interface';
import { ReceivePurchaseOrderService } from './receive-purchase-order.service';

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    restaurantId: 'r-1',
    supplierId: 'sup-1',
    status: 'aberto' as const,
    items: [
      { rawMaterialId: 'rm-1', quantity: 10, unitCost: 2 },
      { rawMaterialId: 'rm-2', quantity: 5, unitCost: 3 },
    ],
    totalValue: 35,
    createdAt: '2026-09-09T08:00:00.000Z',
    ...overrides,
  };
}

describe('ReceivePurchaseOrderService (specs/0015-estoque-compras REQ-3/REQ-7)', () => {
  function setup(
    overrides: {
      purchaseOrderRepository?: Partial<IPurchaseOrderRepository>;
      rawMaterialRepository?: Partial<IRawMaterialRepository>;
      stockMovementRepository?: Partial<IStockMovementRepository>;
      productRepository?: Partial<IProductRepository>;
    } = {},
  ) {
    const purchaseOrderRepository: Partial<IPurchaseOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      markAsReceivedIfOpen: jest.fn().mockResolvedValue(buildOrder({ status: 'recebido', receivedAt: '2026-09-09T09:00:00.000Z' })),
      ...overrides.purchaseOrderRepository,
    };
    const rawMaterialRepository: Partial<IRawMaterialRepository> = {
      incrementStock: jest.fn().mockResolvedValue({ id: 'rm-1', restaurantId: 'r-1', currentStock: 20 }),
      ...overrides.rawMaterialRepository,
    };
    const stockMovementRepository: Partial<IStockMovementRepository> = {
      create: jest.fn().mockResolvedValue({ id: 'mv-1' }),
      ...overrides.stockMovementRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      incrementStock: jest.fn().mockResolvedValue(true),
      ...overrides.productRepository,
    };
    const service = new ReceivePurchaseOrderService(
      purchaseOrderRepository as IPurchaseOrderRepository,
      rawMaterialRepository as IRawMaterialRepository,
      stockMovementRepository as IStockMovementRepository,
      productRepository as IProductRepository,
    );
    return { purchaseOrderRepository, rawMaterialRepository, stockMovementRepository, productRepository, service };
  }

  it('AC-3: com 2 itens, soma o estoque de cada RawMaterial e gera 2 StockMovement de entrada', async () => {
    const { purchaseOrderRepository, rawMaterialRepository, stockMovementRepository, service } = setup();

    const result = await service.receive('po-1', 'r-1');

    expect(purchaseOrderRepository.markAsReceivedIfOpen).toHaveBeenCalledWith('po-1', expect.any(Date));
    expect(rawMaterialRepository.incrementStock).toHaveBeenCalledTimes(2);
    expect(rawMaterialRepository.incrementStock).toHaveBeenCalledWith('rm-1', 10);
    expect(rawMaterialRepository.incrementStock).toHaveBeenCalledWith('rm-2', 5);
    expect(stockMovementRepository.create).toHaveBeenCalledTimes(2);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', rawMaterialId: 'rm-1', type: 'entrada', quantity: 10, purchaseOrderId: 'po-1' }),
    );
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', rawMaterialId: 'rm-2', type: 'entrada', quantity: 5, purchaseOrderId: 'po-1' }),
    );
    expect(result.status).toBe('recebido');
  });

  // Pedido explícito do usuário (follow-up) — item do pedido de compra pode ser um `Product`
  // pronto pra revenda (ex. refrigerante), não só matéria-prima.
  it('item com productId incrementa o estoque do produto e gera StockMovement com productId', async () => {
    const { productRepository, stockMovementRepository, rawMaterialRepository, service } = setup({
      purchaseOrderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ items: [{ productId: 'p-1', quantity: 24, unitCost: 3.5 }] })),
        markAsReceivedIfOpen: jest
          .fn()
          .mockResolvedValue(buildOrder({ items: [{ productId: 'p-1', quantity: 24, unitCost: 3.5 }], status: 'recebido' })),
      },
    });

    await service.receive('po-1', 'r-1');

    expect(productRepository.incrementStock).toHaveBeenCalledWith('p-1', 24);
    expect(rawMaterialRepository.incrementStock).not.toHaveBeenCalled();
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', productId: 'p-1', type: 'entrada', quantity: 24, purchaseOrderId: 'po-1' }),
    );
  });

  it('item com productId cujo produto não tem stockQuantity rastreado não gera StockMovement', async () => {
    const { productRepository, stockMovementRepository, service } = setup({
      purchaseOrderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ items: [{ productId: 'p-1', quantity: 24, unitCost: 3.5 }] })),
        markAsReceivedIfOpen: jest
          .fn()
          .mockResolvedValue(buildOrder({ items: [{ productId: 'p-1', quantity: 24, unitCost: 3.5 }], status: 'recebido' })),
      },
      productRepository: { incrementStock: jest.fn().mockResolvedValue(false) },
    });

    await service.receive('po-1', 'r-1');

    expect(productRepository.incrementStock).toHaveBeenCalledWith('p-1', 24);
    expect(stockMovementRepository.create).not.toHaveBeenCalled();
  });

  it('AC-7: pedido já recebido (markAsReceivedIfOpen devolve null) lança 409, sem tocar em estoque', async () => {
    const { rawMaterialRepository, stockMovementRepository, service } = setup({
      purchaseOrderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'recebido' })),
        markAsReceivedIfOpen: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.receive('po-1', 'r-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(rawMaterialRepository.incrementStock).not.toHaveBeenCalled();
    expect(stockMovementRepository.create).not.toHaveBeenCalled();
  });

  it('AC-7: pedido cancelado também é bloqueado (409)', async () => {
    const { service } = setup({
      purchaseOrderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'cancelado' })),
        markAsReceivedIfOpen: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.receive('po-1', 'r-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lança 404 quando o pedido não existe ou é de outro restaurante', async () => {
    const { service } = setup({ purchaseOrderRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(service.receive('po-x', 'r-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lança 404 quando o pedido pertence a outro restaurante', async () => {
    const { service } = setup({
      purchaseOrderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(service.receive('po-1', 'r-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
