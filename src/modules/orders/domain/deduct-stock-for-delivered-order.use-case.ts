import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IOrder, IOrderItemSelection } from './entities/order.entity';

/**
 * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 (reabre `specs/0041`) — baixa
 * automática de estoque quando um pedido é entregue: o produto principal de cada item, e
 * qualquer produto vinculado (`linkedProductId`) escolhido como adicional — recursivo em
 * `nestedSelections` (produto composto). Nunca mexe em `RawMaterial`/ficha técnica (fora de
 * escopo, ver `spec.md`). Isolado do resto do fluxo de entrega: cada baixa é independente, uma
 * falha numa não impede as outras (mesmo raciocínio de isolamento do lançamento automático de
 * caixa em `OrdersController`).
 */
export class DeductStockForDeliveredOrderUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockMovementRepository: IStockMovementRepository,
  ) {}

  async execute(order: IOrder): Promise<void> {
    for (const item of order.items) {
      await this.deductProduct(order, item.productId, item.quantity);
      if (item.selections) {
        await this.deductSelections(order, item.selections, item.quantity);
      }
    }
  }

  private async deductSelections(order: IOrder, selections: IOrderItemSelection[], parentQuantity: number): Promise<void> {
    for (const selection of selections) {
      if (selection.linkedProductId) {
        await this.deductProduct(order, selection.linkedProductId, parentQuantity);
      }
      if (selection.nestedSelections) {
        await this.deductSelections(order, selection.nestedSelections, parentQuantity);
      }
    }
  }

  private async deductProduct(order: IOrder, productId: string, quantity: number): Promise<void> {
    const deducted = await this.productRepository.decrementStock(productId, quantity);
    if (!deducted) return; // produto sem stockQuantity definido (feito sob demanda) — nada a registrar
    await this.stockMovementRepository.create({
      restaurantId: order.restaurantId,
      productId,
      type: 'saida',
      quantity,
      reason: `Baixa automática — Pedido #${order.orderNumber}`,
    });
  }
}
