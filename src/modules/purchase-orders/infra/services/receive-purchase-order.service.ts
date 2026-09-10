import { ConflictError, NotFoundError } from 'restify-errors';

import { IRawMaterialRepository } from '../../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IPurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { IPurchaseOrderRepository } from '../../domain/repositories/purchase-order.repository.interface';
import { IReceivePurchaseOrderService } from '../../domain/services/i-receive-purchase-order.service';

/**
 * specs/0015-estoque-compras REQ-3/REQ-7 (AC-3/AC-7) — mesmo espírito de `CashRegisterService`
 * (specs/0014-financeiro): regra de negócio isolada num service próprio, não espalhada pelo
 * controller, pra ficar testável sem precisar montar rota HTTP.
 *
 * **Atomicidade (REQ-3):** este BFF não usa transações multi-documento do Mongoose em nenhum
 * módulo (`docs/architecture/patterns.md` §16.6.1) — decisão coerente com o ambiente real, onde
 * o MongoDB roda standalone (`docker-compose.yml`, um único serviço `mongo:7`, sem replica set),
 * e `session.startTransaction()` falharia em runtime. A garantia de "nunca aplicar o recebimento
 * duas vezes" (REQ-7) não depende de transação: vem do **compare-and-swap** atômico por
 * documento em `markAsReceivedIfOpen` (`findOneAndUpdate` filtrando `status: 'aberto'`) — só um
 * request concorrente consegue transicionar o status, os demais recebem `null` e viram 409. A
 * soma em `RawMaterial.currentStock` e a criação da `StockMovement` por item, essas sim, não são
 * atômicas *entre si* nem entre itens: são aplicadas sequencialmente após o CAS ter sucesso, cada
 * incremento sendo atômico só no próprio documento (`$inc`). Se o processo cair no meio do loop,
 * o pedido já está `recebido` mas nem todo item terá sua `StockMovement`/incremento — cenário raro
 * (sem I/O de rede no meio, só operações Mongo em sequência) e reconciliável manualmente via
 * ajuste de estoque (REQ-5), dado que o histórico de `StockMovement` já criado mostra exatamente
 * o que faltou. Ver "Notas de implementação" em `specs/0015-estoque-compras/tasks.md`.
 */
export class ReceivePurchaseOrderService implements IReceivePurchaseOrderService {
  constructor(
    private readonly purchaseOrderRepository: IPurchaseOrderRepository,
    private readonly rawMaterialRepository: IRawMaterialRepository,
    private readonly stockMovementRepository: IStockMovementRepository,
  ) {}

  async receive(purchaseOrderId: string, restaurantId: string): Promise<IPurchaseOrder> {
    const existing = await this.purchaseOrderRepository.findById(purchaseOrderId);
    if (!existing || existing.restaurantId !== restaurantId) {
      throw new NotFoundError('Pedido de compra não encontrado');
    }

    const updated = await this.purchaseOrderRepository.markAsReceivedIfOpen(purchaseOrderId, new Date());
    if (!updated) {
      // REQ-7/AC-7
      throw new ConflictError('Pedido de compra já foi recebido ou cancelado');
    }

    // REQ-3/AC-3 — sequencial (não Promise.all) pra manter o racional de aplicação item a item
    // documentado acima previsível de auditar.
    for (const item of updated.items) {
      await this.rawMaterialRepository.incrementStock(item.rawMaterialId, item.quantity);
      await this.stockMovementRepository.create({
        restaurantId,
        rawMaterialId: item.rawMaterialId,
        type: 'entrada',
        quantity: item.quantity,
        reason: `Recebimento — Pedido de compra #${updated.id}`,
        purchaseOrderId: updated.id,
      });
    }

    return updated;
  }
}
