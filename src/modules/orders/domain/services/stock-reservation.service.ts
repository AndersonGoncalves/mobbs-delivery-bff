import { randomUUID } from 'crypto';
import { ConflictError, NotFoundError } from 'restify-errors';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IOrderItem, IOrderItemSelection, IOrderItemStockReservation } from '../entities/order.entity';

type Resource = { resourceType: 'product' | 'rawMaterial'; resourceId: string; unitsPerItem: number };

function duplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function collectResources(item: IOrderItem): Resource[] {
  const resources = new Map<string, Resource>();
  const add = (resourceType: Resource['resourceType'], resourceId: string) => {
    const key = `${resourceType}:${resourceId}`;
    const existing = resources.get(key);
    if (existing) existing.unitsPerItem += 1;
    else resources.set(key, { resourceType, resourceId, unitsPerItem: 1 });
  };
  const visit = (selections: IOrderItemSelection[] = []) => {
    for (const selection of selections) {
      if (selection.linkedProductId) add('product', selection.linkedProductId);
      if (selection.rawMaterialId) add('rawMaterial', selection.rawMaterialId);
      if (selection.nestedSelections) visit(selection.nestedSelections);
    }
  };
  add('product', item.productId);
  visit(item.selections);
  return [...resources.values()];
}

export class StockReservationService {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly rawMaterialRepository: IRawMaterialRepository,
    private readonly movementRepository: IStockMovementRepository,
  ) {}

  async reserveOrderItems(
    restaurantId: string,
    items: IOrderItem[],
    stockControlEnabled: boolean,
    orderId: string,
    operationPrefix: string,
  ): Promise<IOrderItem[]> {
    if (!stockControlEnabled) return items;

    // Achado crítico de auditoria pré-produção (31/10/2026) — "reserva de estoque no checkout:
    // N+1 sequencial por item/adicional": as duas checagens de LEITURA que dominavam o
    // round-trip (produto/matéria-prima rastreia estoque? já existe reserva/rollback deste
    // operationId?) rodavam uma vez POR item/adicional — pedido com muitos itens acumulava
    // dezenas de round-trips sequenciais antes de sequer começar a reservar. Agora rodam em
    // lote, uma vez pra TODO o pedido. A escrita (`reserveResource`: decrementStockIfAvailable +
    // movimento) continua sequencial por recurso, de propósito — é onde a reserva/compensação de
    // verdade acontece, não dá pra paralelizar sem arriscar o invariante de rollback em cascata
    // do `catch` abaixo.
    const entries = items.flatMap((item) => collectResources(item).map((resource) => ({ item, resource })));
    const productIds = [...new Set(entries.filter(({ resource }) => resource.resourceType === 'product').map(({ resource }) => resource.resourceId))];
    const rawMaterialIds = [
      ...new Set(entries.filter(({ resource }) => resource.resourceType === 'rawMaterial').map(({ resource }) => resource.resourceId)),
    ];
    const [products, rawMaterials] = await Promise.all([
      this.productRepository.findManyByIds(productIds),
      this.rawMaterialRepository.findManyByIds(rawMaterialIds),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const rawMaterialById = new Map(rawMaterials.map((material) => [material.id, material]));

    const baseOperationIdOf = (item: IOrderItem, resource: Resource) =>
      `${operationPrefix}:${item.id}:${resource.resourceType}:${resource.resourceId}`;

    const trackedKeys = new Set(
      entries
        .filter(({ resource }) => {
          if (resource.resourceType === 'product') {
            const product = productById.get(resource.resourceId);
            if (!product || product.restaurantId !== restaurantId) throw new NotFoundError('Produto não encontrado');
            return product.tracksStock === true;
          }
          const material = rawMaterialById.get(resource.resourceId);
          if (!material || material.restaurantId !== restaurantId) throw new NotFoundError('Matéria-prima não encontrada');
          return material.tracksStock === true;
        })
        .map(({ item, resource }) => `${item.id}:${resource.resourceType}:${resource.resourceId}`),
    );

    const operationIdsToCheck = entries
      .filter(({ item, resource }) => trackedKeys.has(`${item.id}:${resource.resourceType}:${resource.resourceId}`))
      .flatMap(({ item, resource }) => {
        const base = baseOperationIdOf(item, resource);
        return [base, `${base}:rollback`];
      });
    const existingMovements = await this.movementRepository.findManyByOperationIds(restaurantId, operationIdsToCheck);
    const movementByOperationId = new Map(existingMovements.map((movement) => [movement.operationId!, movement]));

    const reservedThisAttempt: IOrderItemStockReservation[] = [];
    try {
      const result: IOrderItem[] = [];
      for (const item of items) {
        const stockReservations: IOrderItemStockReservation[] = [];
        for (const resource of collectResources(item)) {
          if (!trackedKeys.has(`${item.id}:${resource.resourceType}:${resource.resourceId}`)) continue;
          const quantity = resource.unitsPerItem * item.quantity;
          const baseOperationId = baseOperationIdOf(item, resource);
          const existing = movementByOperationId.get(baseOperationId) ?? null;
          const rolledBack = existing ? movementByOperationId.get(`${baseOperationId}:rollback`) ?? null : null;
          const operationId = existing && rolledBack ? `${baseOperationId}:retry:${randomUUID()}` : baseOperationId;
          if (existing && !rolledBack) {
            stockReservations.push({ ...resource, quantity: existing.quantity, operationId });
            continue;
          }
          const reservation = await this.reserveResource(restaurantId, orderId, resource, quantity, operationId);
          stockReservations.push(reservation);
          reservedThisAttempt.push(reservation);
        }
        result.push({ ...item, stockReservations });
      }
      return result;
    } catch (error) {
      await this.rollback(restaurantId, orderId, reservedThisAttempt);
      throw error;
    }
  }

  async resizeItemReservations(
    restaurantId: string,
    orderId: string,
    item: IOrderItem,
    quantityDelta: number,
    operationId: string,
  ): Promise<IOrderItemStockReservation[]> {
    if (quantityDelta === 0) return item.stockReservations ?? [];
    const originalSnapshots = [...(item.stockReservations ?? [])];
    const snapshots = [...originalSnapshots];
    const sign = Math.sign(quantityDelta);
    const absoluteDelta = Math.abs(quantityDelta);
    const completed: IOrderItemStockReservation[] = [];
    try {
      const resources = new Map<string, IOrderItemStockReservation>();
      for (const snapshot of originalSnapshots) {
        const key = `${snapshot.resourceType}:${snapshot.resourceId}`;
        if (!resources.has(key)) resources.set(key, snapshot);
      }
      for (const snapshot of resources.values()) {
        const quantity = snapshot.unitsPerItem * absoluteDelta;
        if (sign > 0) {
          const resource: Resource = {
            resourceType: snapshot.resourceType,
            resourceId: snapshot.resourceId,
            unitsPerItem: snapshot.unitsPerItem,
          };
          const reservation = await this.reserveResource(
            restaurantId,
            orderId,
            resource,
            quantity,
            `${operationId}:${snapshot.resourceType}:${snapshot.resourceId}`,
          );
          completed.push(reservation);
          snapshots.push(reservation);
        } else {
          await this.releaseResource(
            restaurantId,
            orderId,
            snapshot,
            quantity,
            `${operationId}:reduce:${snapshot.resourceType}:${snapshot.resourceId}`,
            'Devolução por redução de quantidade',
          );
          let remaining = quantity;
          for (let index = 0; index < snapshots.length && remaining > 0; index += 1) {
            const current = snapshots[index];
            if (current.resourceType !== snapshot.resourceType || current.resourceId !== snapshot.resourceId) continue;
            const released = Math.min(current.quantity, remaining);
            current.quantity -= released;
            remaining -= released;
          }
        }
      }
      return snapshots.filter((snapshot) => snapshot.quantity > 0);
    } catch (error) {
      if (sign > 0) await this.rollback(restaurantId, orderId, completed);
      throw error;
    }
  }

  async releaseOrderReservations(restaurantId: string, orderId: string, items: IOrderItem[]): Promise<void> {
    for (const item of items) {
      for (const reservation of item.stockReservations ?? []) {
        await this.releaseResource(
          restaurantId,
          orderId,
          reservation,
          reservation.quantity,
          `${reservation.operationId}:release`,
          `Devolução — pedido ${orderId} cancelado`,
        );
      }
    }
  }

  async releaseReservationsNotAttachedToOrder(
    restaurantId: string,
    orderId: string,
    attemptedItems: IOrderItem[],
    persistedItems: IOrderItem[],
  ): Promise<void> {
    const persistedOperationIds = new Set(
      persistedItems.flatMap((item) => (item.stockReservations ?? []).map((reservation) => reservation.operationId)),
    );
    const orphanedItems = attemptedItems.map((item) => ({
      ...item,
      stockReservations: (item.stockReservations ?? []).filter((reservation) => !persistedOperationIds.has(reservation.operationId)),
    }));
    await this.releaseOrderReservations(restaurantId, orderId, orphanedItems);
  }

  private async reserveResource(
    restaurantId: string,
    orderId: string,
    resource: Resource,
    quantity: number,
    operationId: string,
  ): Promise<IOrderItemStockReservation> {
    const reserved = resource.resourceType === 'product'
      ? await this.productRepository.decrementStockIfAvailable(resource.resourceId, quantity)
      : await this.rawMaterialRepository.decrementStockIfAvailable(resource.resourceId, quantity);
    if (!reserved) throw new ConflictError('Estoque insuficiente para concluir a venda');

    try {
      await this.movementRepository.create({
        restaurantId,
        orderId,
        operationId,
        productId: resource.resourceType === 'product' ? resource.resourceId : undefined,
        rawMaterialId: resource.resourceType === 'rawMaterial' ? resource.resourceId : undefined,
        type: 'saida',
        quantity,
        reason: `Reserva — pedido ${orderId}`,
      });
    } catch (error) {
      if (!duplicateKey(error)) {
        await this.restoreResource(resource, quantity);
        throw error;
      }
      await this.restoreResource(resource, quantity);
      await this.movementRepository.create({
        restaurantId,
        orderId,
        operationId: `${operationId}:duplicate-compensation:${randomUUID()}`,
        productId: resource.resourceType === 'product' ? resource.resourceId : undefined,
        rawMaterialId: resource.resourceType === 'rawMaterial' ? resource.resourceId : undefined,
        type: 'entrada',
        quantity,
        reason: `Compensação de reserva repetida — pedido ${orderId}`,
      });
    }
    return { ...resource, quantity, operationId };
  }

  private async rollback(restaurantId: string, orderId: string, reservations: IOrderItemStockReservation[]): Promise<void> {
    for (const reservation of reservations) {
      await this.releaseResource(
        restaurantId,
        orderId,
        reservation,
        reservation.quantity,
        `${reservation.operationId}:rollback`,
        `Compensação de reserva — pedido ${orderId}`,
      );
    }
  }

  private async releaseResource(
    restaurantId: string,
    orderId: string,
    reservation: IOrderItemStockReservation,
    quantity: number,
    operationId: string,
    reason: string,
  ): Promise<void> {
    if (await this.movementRepository.findByOperationId(restaurantId, operationId)) return;
    await this.restoreResource(reservation, quantity);
    await this.movementRepository.create({
      restaurantId,
      orderId,
      operationId,
      productId: reservation.resourceType === 'product' ? reservation.resourceId : undefined,
      rawMaterialId: reservation.resourceType === 'rawMaterial' ? reservation.resourceId : undefined,
      type: 'entrada',
      quantity,
      reason,
    });
  }

  private async restoreResource(resource: Pick<IOrderItemStockReservation, 'resourceType' | 'resourceId'>, quantity: number): Promise<void> {
    const restored = resource.resourceType === 'product'
      ? await this.productRepository.restoreStock(resource.resourceId, quantity)
      : await this.rawMaterialRepository.incrementStock(resource.resourceId, quantity);
    if (!restored) throw new NotFoundError('Item de estoque não encontrado para devolução');
  }
}
