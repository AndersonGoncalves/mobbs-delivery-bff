import { randomUUID } from 'crypto';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';
import { ICustomerRepository } from '../../../customers/domain/repositories/customer.repository.interface';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { IOrder, IOrderItem, IOrderItemSelection } from '../../../orders/domain/entities/order.entity';
import { IProductAdditionalGroup } from '../../../catalog/domain/entities/product.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurantTableRepository } from '../repositories/table.repository.interface';
import { ITableWaiterRepository } from '../repositories/waiter.repository.interface';
import { ITableMapLayoutRepository } from '../repositories/table-map-layout.repository.interface';

type SelectionInput = { groupName: string; optionName: string; nestedSelections?: SelectionInput[] };
type Adjustment = NonNullable<IOrder['tableAdjustment']>;

function calculateTotals(order: IOrder, items: IOrderItem[], patch: Partial<IOrder> = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const serviceChargePercent = patch.serviceChargePercent ?? order.serviceChargePercent ?? 0;
  const serviceChargeAmount = subtotal * serviceChargePercent / 100;
  const coverCharge = patch.coverCharge ?? order.coverCharge ?? 0;
  const tableAdjustment = patch.tableAdjustment === undefined ? order.tableAdjustment : patch.tableAdjustment;
  const beforeAdjustment = subtotal + serviceChargeAmount + coverCharge;
  const adjustmentAmount = tableAdjustment
    ? tableAdjustment.mode === 'percent' ? beforeAdjustment * tableAdjustment.value / 100 : tableAdjustment.value
    : 0;
  const discount = tableAdjustment?.type === 'discount' ? Math.min(beforeAdjustment, adjustmentAmount) : 0;
  const total = Math.max(0, beforeAdjustment + (tableAdjustment?.type === 'surcharge' ? adjustmentAmount : -discount));
  return { subtotal, serviceChargePercent, serviceChargeAmount, coverCharge, tableAdjustment, discount, total };
}

function resolveSelections(groups: IProductAdditionalGroup[], selections: SelectionInput[]): { resolved: IOrderItemSelection[]; extra: number } {
  const groupNames = new Set(groups.map((group) => group.name));
  if (selections.some((selection) => !groupNames.has(selection.groupName))) throw new BadRequestError('Adicional não pertence ao produto');

  let extra = 0;
  const resolved: IOrderItemSelection[] = [];
  for (const group of groups) {
    const selected = selections.filter((selection) => selection.groupName === group.name);
    if (selected.length < group.minSelections || selected.length > group.maxSelections) {
      throw new BadRequestError(`Selecione entre ${group.minSelections} e ${group.maxSelections} opção(ões) em ${group.name}`);
    }
    for (const selection of selected) {
      const option = group.options.find((candidate) => candidate.name === selection.optionName);
      if (!option) throw new BadRequestError(`Opção inválida em ${group.name}`);
      const nested = resolveSelections(option.nestedAdditionalGroups ?? [], selection.nestedSelections ?? []);
      const priceDelta = option.priceDelta ?? 0;
      extra += priceDelta + nested.extra;
      resolved.push({
        groupName: group.name,
        optionName: option.name,
        priceDelta,
        ...(nested.resolved.length > 0 ? { nestedSelections: nested.resolved } : {}),
      });
    }
  }
  return { resolved, extra };
}

export class TableOrderService {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tableRepository: IRestaurantTableRepository,
    private readonly waiterRepository: ITableWaiterRepository,
    private readonly layoutRepository: ITableMapLayoutRepository,
    private readonly productRepository: IProductRepository,
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async getFloor(restaurantId: string) {
    const [tables, activeOrders, layout, waiters] = await Promise.all([
      this.tableRepository.listByRestaurant(restaurantId),
      this.orderRepository.findActiveByRestaurant(restaurantId),
      this.layoutRepository.getByRestaurant(restaurantId),
      this.waiterRepository.listByRestaurant(restaurantId),
    ]);
    const tableOrders = activeOrders.filter((order) => order.orderType === 'table');
    return {
      tables: tables.map((table) => ({ ...table, order: tableOrders.find((order) => order.id === table.activeOrderId) ?? null })),
      counterOrders: tableOrders.filter((order) => !order.tableId),
      waiters: waiters.filter((waiter) => waiter.isActive),
      decorations: layout.decorations,
      spendingLimit: layout.spendingLimit,
    };
  }

  async getActiveOrders(restaurantId: string) {
    return (await this.orderRepository.findActiveByRestaurant(restaurantId)).filter((order) => order.orderType === 'table');
  }

  async getClosedHistory(restaurantId: string, from: Date, to: Date) {
    return this.orderRepository.findClosedTableOrders(restaurantId, from, to);
  }

  async getOrder(restaurantId: string, orderId: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order || order.restaurantId !== restaurantId || order.orderType !== 'table') throw new NotFoundError('Pedido de mesa não encontrado');
    return order;
  }

  async openOrder(restaurantId: string, input: { tableId?: string | null; waiterId?: string | null }) {
    const table = input.tableId ? await this.tableRepository.findById(input.tableId, restaurantId) : null;
    if (input.tableId && !table) throw new NotFoundError('Mesa não encontrada');
    if (table && (table.activeOrderId || await this.orderRepository.findActiveTableOrder(restaurantId, table.id))) {
      throw new ConflictError('Esta mesa já está ocupada');
    }

    const waiter = input.waiterId ? await this.waiterRepository.findById(input.waiterId, restaurantId) : null;
    if (input.waiterId && (!waiter || !waiter.isActive)) throw new NotFoundError('Garçom ativo não encontrado');

    const customerId = await this.ensureCounterCustomer(restaurantId);
    const order = await this.orderRepository.create({
      customerId,
      restaurantId,
      items: [],
      orderType: 'table',
      subtotal: 0,
      deliveryFee: 0,
      discount: 0,
      total: 0,
      paymentMethod: 'cash',
      initialStatus: 'confirmado',
      tableId: table?.id,
      tableName: table?.name ?? 'Balcão',
      tableWaiter: waiter ? { id: waiter.id, name: waiter.name } : undefined,
      serviceChargePercent: 10,
      serviceChargeAmount: 0,
      coverCharge: 0,
      tablePayments: [],
    });

    if (table && !(await this.tableRepository.claimForOrder(table.id, restaurantId, order.id))) {
      await this.orderRepository.updateStatus(order.id, 'cancelado', restaurantId, 'Mesa ocupada por outra abertura concorrente');
      throw new ConflictError('Esta mesa já está ocupada');
    }
    return order;
  }

  async addItem(restaurantId: string, orderId: string, input: { productId: string; quantity: number; selections: SelectionInput[]; notes?: string }) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    const layout = order.tableId ? await this.layoutRepository.getByRestaurant(restaurantId) : null;
    if (order.tableId) {
      const currentBalance = this.balanceDue(order);
      if (layout.spendingLimit && currentBalance >= layout.spendingLimit) {
        throw new ConflictError('Limite de consumo atingido. Registre um pagamento parcial para incluir novos itens.');
      }
    }

    const product = await this.productRepository.findById(input.productId);
    if (!product || product.restaurantId !== restaurantId || !product.isAvailable) throw new NotFoundError('Produto disponível não encontrado');
    const selections = resolveSelections(product.additionalGroups ?? [], input.selections);
    const item: IOrderItem = {
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      quantity: input.quantity,
      unitPrice: product.price + selections.extra,
      selections: selections.resolved,
      notes: input.notes?.trim() || undefined,
    };
    const items = [...order.items, item];
    const totals = calculateTotals(order, items);
    const paid = (order.tablePayments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
    if (layout?.spendingLimit && totals.total - paid > layout.spendingLimit) {
      throw new ConflictError('Este item ultrapassaria o limite de consumo configurado. Registre um pagamento parcial antes de continuar.');
    }
    const updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { items, ...totals });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    return updated;
  }

  async setItemQuantity(restaurantId: string, orderId: string, itemId: string, quantity: number) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    const currentItem = order.items.find((item) => item.id === itemId);
    if (!currentItem) throw new NotFoundError('Item do pedido não encontrado');
    const items = quantity === 0
      ? order.items.filter((item) => item.id !== itemId)
      : order.items.map((item) => item.id === itemId ? { ...item, quantity } : item);
    const totals = calculateTotals(order, items);
    if (quantity > currentItem.quantity && order.tableId) {
      const layout = await this.layoutRepository.getByRestaurant(restaurantId);
      const paid = (order.tablePayments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
      if (layout.spendingLimit && totals.total - paid > layout.spendingLimit) {
        throw new ConflictError('Este item ultrapassaria o limite de consumo configurado. Registre um pagamento parcial antes de continuar.');
      }
    }
    const updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { items, ...totals });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    return updated;
  }

  async groupDuplicateItems(restaurantId: string, orderId: string) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    const groups = new Map<string, IOrderItem>();
    for (const item of order.items) {
      const key = JSON.stringify([item.productId, item.unitPrice, item.selections ?? [], item.notes ?? '']);
      const existing = groups.get(key);
      if (existing) existing.quantity += item.quantity;
      else groups.set(key, { ...item });
    }
    const items = [...groups.values()];
    const updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { items, ...calculateTotals(order, items) });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    return updated;
  }

  async updateAdjustments(restaurantId: string, orderId: string, input: {
    serviceChargePercent?: number;
    coverCharge?: number | null;
    adjustment?: Adjustment | null;
    peopleCount?: number | null;
  }) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    const patch = {
      serviceChargePercent: input.serviceChargePercent ?? order.serviceChargePercent ?? 0,
      coverCharge: input.coverCharge ?? (input.coverCharge === null ? 0 : order.coverCharge ?? 0),
      tableAdjustment: input.adjustment === undefined ? order.tableAdjustment : input.adjustment ?? undefined,
      tablePeopleCount: input.peopleCount === undefined ? order.tablePeopleCount : input.peopleCount ?? undefined,
    };
    const updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { ...patch, ...calculateTotals(order, order.items, patch) });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    return updated;
  }

  async addPartialPayment(restaurantId: string, orderId: string, method: IOrder['paymentMethod'], amount: number, operatorId: string) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    const balance = this.balanceDue(order);
    if (amount >= balance) throw new BadRequestError('O pagamento parcial deve ser menor que o saldo em aberto');
    const updated = await this.orderRepository.addTablePayment(order.id, restaurantId, {
      id: randomUUID(), method, amount, paidAt: new Date().toISOString(), paidBy: operatorId,
    });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    return updated;
  }

  async closeOrder(restaurantId: string, orderId: string, payments: { method: IOrder['paymentMethod']; amount: number }[], operatorId: string) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    if (order.items.length === 0) throw new BadRequestError('Adicione pelo menos um item antes de fechar a conta');
    const remaining = this.balanceDue(order);
    const closingTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (payments.length === 0 || Math.abs(closingTotal - remaining) > 0.01) {
      throw new BadRequestError(`Os pagamentos devem somar o saldo em aberto de ${remaining.toFixed(2)}`);
    }

    const now = new Date().toISOString();
    let updated: IOrder | null = order;
    for (const payment of payments) {
      updated = await this.orderRepository.addTablePayment(order.id, restaurantId, {
        id: randomUUID(), method: payment.method, amount: payment.amount, paidAt: now, paidBy: operatorId,
      });
      if (!updated) throw new ConflictError('O pedido não está mais aberto');
    }
    updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { tableClosedAt: now });
    if (!updated) throw new ConflictError('O pedido não está mais aberto');
    const closed = await this.orderRepository.updateStatus(order.id, 'entregue', restaurantId);
    if (order.tableId) await this.tableRepository.releaseFromOrder(order.tableId, restaurantId, order.id);
    return closed;
  }

  async transferOrder(restaurantId: string, orderId: string, targetTableId: string) {
    const order = await this.findOpenOrder(restaurantId, orderId);
    if (!order.tableId) throw new BadRequestError('Pedido de balcão não pode ser transferido');
    const target = await this.tableRepository.findById(targetTableId, restaurantId);
    if (!target) throw new NotFoundError('Mesa de destino não encontrada');
    if (target.activeOrderId || await this.orderRepository.findActiveTableOrder(restaurantId, target.id)) throw new ConflictError('Mesa de destino já está ocupada');
    if (!(await this.tableRepository.claimForOrder(target.id, restaurantId, order.id))) throw new ConflictError('Mesa de destino já está ocupada');
    const updated = await this.orderRepository.updateTableOrder(order.id, restaurantId, { tableId: target.id, tableName: target.name });
    if (!updated) {
      await this.tableRepository.releaseFromOrder(target.id, restaurantId, order.id);
      throw new ConflictError('O pedido não está mais aberto');
    }
    await this.tableRepository.releaseFromOrder(order.tableId, restaurantId, order.id);
    return updated;
  }

  async mergeOrders(restaurantId: string, sourceOrderId: string, targetOrderId: string) {
    if (sourceOrderId === targetOrderId) throw new BadRequestError('Selecione pedidos de mesas diferentes');
    const source = await this.findOpenOrder(restaurantId, sourceOrderId);
    const target = await this.findOpenOrder(restaurantId, targetOrderId);
    if (!source.tableId || !target.tableId) throw new BadRequestError('Balcão não pode ser unido a uma mesa');

    const items = [...target.items, ...source.items];
    const tablePayments = [...(target.tablePayments ?? []), ...(source.tablePayments ?? [])];
    const updatedTarget = await this.orderRepository.updateTableOrder(target.id, restaurantId, {
      items,
      tablePayments,
      subtotal: target.subtotal + source.subtotal,
      serviceChargeAmount: (target.serviceChargeAmount ?? 0) + (source.serviceChargeAmount ?? 0),
      coverCharge: (target.coverCharge ?? 0) + (source.coverCharge ?? 0),
      discount: target.discount + source.discount,
      total: target.total + source.total,
    });
    if (!updatedTarget) throw new ConflictError('Pedido de destino não está mais aberto');
    await this.orderRepository.updateTableOrder(source.id, restaurantId, {
      tableClosedAt: new Date().toISOString(),
      tableMergedIntoOrderId: target.id,
    });
    await this.orderRepository.updateStatus(source.id, 'cancelado', restaurantId, `Unido ao pedido ${target.orderNumber}`);
    await this.tableRepository.releaseFromOrder(source.tableId, restaurantId, source.id);
    return updatedTarget;
  }

  private async findOpenOrder(restaurantId: string, orderId: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order || order.restaurantId !== restaurantId || order.orderType !== 'table' || ['entregue', 'cancelado'].includes(order.status)) {
      throw new NotFoundError('Pedido de mesa aberto não encontrado');
    }
    return order;
  }

  private async ensureCounterCustomer(restaurantId: string) {
    const id = `table-customer-${restaurantId}`;
    const current = await this.customerRepository.findById(id);
    if (current) return current.id;
    const customer = await this.customerRepository.upsertProfile(id, {
      name: 'Cliente balcão',
      email: `balcao-${restaurantId}@anonymous.mobbs-delivery.local`,
    });
    return customer.id;
  }

  private balanceDue(order: IOrder) {
    return Math.max(0, order.total - (order.tablePayments ?? []).reduce((sum, payment) => sum + payment.amount, 0));
  }
}
