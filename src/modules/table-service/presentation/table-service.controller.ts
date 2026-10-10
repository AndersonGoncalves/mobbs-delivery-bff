import { randomUUID } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';
import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { normalizeTableName } from '../domain/normalize-table-name';
import { IRestaurantTableRepository } from '../domain/repositories/table.repository.interface';
import { ITableMapLayoutRepository } from '../domain/repositories/table-map-layout.repository.interface';
import { ITableWaiterRepository } from '../domain/repositories/waiter.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { TableOrderService } from '../domain/services/table-order.service';
import {
  addTableOrderItemSchema,
  addTablePaymentSchema,
  closeTableOrderSchema,
  createTableRangeSchema,
  openTableOrderSchema,
  saveTableMapLayoutSchema,
  saveTableSchema,
  saveTableWaiterSchema,
  tableOrderAdjustmentsSchema,
  tableOrderHistoryQuerySchema,
  tableOrderIdSchema,
  transferTableOrderSchema,
  updateTableOrderItemQuantitySchema,
  updateTablePositionSchema,
} from './table-service.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

export class TableServiceController extends BaseRouter {
  constructor(
    private readonly tableRepository: IRestaurantTableRepository,
    private readonly waiterRepository: ITableWaiterRepository,
    private readonly layoutRepository: ITableMapLayoutRepository,
    private readonly orderRepository: IOrderRepository,
    customerRepository: ICustomerRepository,
    productRepository: IProductRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
    this.tableOrders = new TableOrderService(orderRepository, tableRepository, waiterRepository, layoutRepository, productRepository, customerRepository);
  }

  private readonly tableOrders: TableOrderService;

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/table-service/map', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.getFloor(req.restaurantId!));
    });

    application.get('/restaurants/me/table-orders/active', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.getActiveOrders(req.restaurantId!));
    });

    application.post('/restaurants/me/table-orders', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(openTableOrderSchema, req.body);
      res.json(201, await this.tableOrders.openOrder(req.restaurantId!, input));
    });

    application.get('/restaurants/me/table-orders/history', ...authenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(tableOrderHistoryQuerySchema, req.query);
      res.json(200, await this.tableOrders.getClosedHistory(req.restaurantId!, new Date(from), new Date(to)));
    });

    application.get('/restaurants/me/table-orders/:id', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.getOrder(req.restaurantId!, req.params.id));
    });

    application.post('/restaurants/me/table-orders/:id/items', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(addTableOrderItemSchema, req.body);
      res.json(200, await this.tableOrders.addItem(req.restaurantId!, req.params.id, input));
    });

    application.patch('/restaurants/me/table-orders/:id/items/:itemId/quantity', ...authenticated, async (req: Request, res: Response) => {
      const { quantity } = parseBody(updateTableOrderItemQuantitySchema, req.body);
      res.json(200, await this.tableOrders.setItemQuantity(req.restaurantId!, req.params.id, req.params.itemId, quantity));
    });

    application.post('/restaurants/me/table-orders/:id/items/group', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.groupDuplicateItems(req.restaurantId!, req.params.id));
    });

    application.patch('/restaurants/me/table-orders/:id/adjustments', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(tableOrderAdjustmentsSchema, req.body);
      res.json(200, await this.tableOrders.updateAdjustments(req.restaurantId!, req.params.id, input));
    });

    application.post('/restaurants/me/table-orders/:id/payments', ...authenticated, async (req: Request, res: Response) => {
      const { method, amount } = parseBody(addTablePaymentSchema, req.body);
      res.json(200, await this.tableOrders.addPartialPayment(req.restaurantId!, req.params.id, method, amount, req.user!.uid));
    });

    application.post('/restaurants/me/table-orders/:id/close', ...authenticated, async (req: Request, res: Response) => {
      const { payments } = parseBody(closeTableOrderSchema, req.body);
      res.json(200, await this.tableOrders.closeOrder(req.restaurantId!, req.params.id, payments, req.user!.uid));
    });

    application.post('/restaurants/me/table-orders/:id/transfer', ...authenticated, async (req: Request, res: Response) => {
      const { tableId } = parseBody(transferTableOrderSchema, req.body);
      res.json(200, await this.tableOrders.transferOrder(req.restaurantId!, req.params.id, tableId));
    });

    application.post('/restaurants/me/table-orders/:id/merge', ...authenticated, async (req: Request, res: Response) => {
      const { orderId } = parseBody(tableOrderIdSchema, req.body);
      res.json(200, await this.tableOrders.mergeOrders(req.restaurantId!, req.params.id, orderId));
    });

    application.get('/restaurants/me/tables', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableRepository.listByRestaurant(req.restaurantId!));
    });

    application.post('/restaurants/me/tables', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveTableSchema, req.body);
      await this.ensureNameAvailable(req.restaurantId!, input.name);
      res.json(201, await this.tableRepository.create(req.restaurantId!, input));
    });

    application.post('/restaurants/me/tables/range', ...authenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(createTableRangeSchema, req.body);
      const inputs = Array.from({ length: to - from + 1 }, (_, index) => ({ name: String(from + index) }));
      const existingNames = new Set((await this.tableRepository.listByRestaurant(req.restaurantId!)).map((table) => table.normalizedName));
      const duplicate = inputs.find((input) => existingNames.has(normalizeTableName(input.name)));
      if (duplicate) throw new ConflictError(`Já existe a mesa ${duplicate.name}`);
      res.json(201, await this.tableRepository.createMany(req.restaurantId!, inputs));
    });

    application.put('/restaurants/me/tables/:id', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveTableSchema, req.body);
      const current = await this.findTable(req.params.id, req.restaurantId!);
      if (normalizeTableName(current.name) !== normalizeTableName(input.name)) {
        await this.ensureNameAvailable(req.restaurantId!, input.name);
      }
      const updated = await this.tableRepository.update(current.id, req.restaurantId!, input);
      res.json(200, updated);
    });

    application.put('/restaurants/me/tables/:id/position', ...authenticated, async (req: Request, res: Response) => {
      const { position } = parseBody(updateTablePositionSchema, req.body);
      const table = await this.findTable(req.params.id, req.restaurantId!);
      const updated = await this.tableRepository.updatePosition(table.id, req.restaurantId!, position);
      res.json(200, updated);
    });

    application.del('/restaurants/me/tables/:id', ...authenticated, async (req: Request, res: Response) => {
      await this.findTable(req.params.id, req.restaurantId!);
      const deleted = await this.tableRepository.deleteIfFree(req.params.id, req.restaurantId!);
      if (!deleted) throw new ConflictError('Mesa ocupada não pode ser excluída');
      res.send(204);
    });

    application.get('/restaurants/me/table-map/layout', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.layoutRepository.getByRestaurant(req.restaurantId!));
    });

    application.put('/restaurants/me/table-map/layout', ...authenticated, async (req: Request, res: Response) => {
      const { decorations, spendingLimit } = parseBody(saveTableMapLayoutSchema, req.body);
      const normalized = decorations.map((decoration) => ({ ...decoration, id: decoration.id ?? randomUUID() }));
      res.json(200, await this.layoutRepository.save(req.restaurantId!, normalized, spendingLimit));
    });

    application.get('/restaurants/me/waiters', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.waiterRepository.listByRestaurant(req.restaurantId!));
    });

    application.post('/restaurants/me/waiters', ...authenticated, async (req: Request, res: Response) => {
      const { name } = parseBody(saveTableWaiterSchema, req.body);
      res.json(201, await this.waiterRepository.create(req.restaurantId!, name));
    });

    application.put('/restaurants/me/waiters/:id', ...authenticated, async (req: Request, res: Response) => {
      const { name } = parseBody(saveTableWaiterSchema, req.body);
      const updated = await this.waiterRepository.update(req.params.id, req.restaurantId!, name);
      if (!updated) throw new NotFoundError('Garçom não encontrado');
      res.json(200, updated);
    });

    application.del('/restaurants/me/waiters/:id', ...authenticated, async (req: Request, res: Response) => {
      const removed = await this.waiterRepository.remove(req.params.id, req.restaurantId!);
      if (!removed) throw new NotFoundError('Garçom não encontrado');
      res.send(204);
    });
  }

  private async findTable(id: string, restaurantId: string) {
    const table = await this.tableRepository.findById(id, restaurantId);
    if (!table) throw new NotFoundError('Mesa não encontrada');
    return table;
  }

  private async ensureNameAvailable(restaurantId: string, name: string) {
    const duplicate = await this.tableRepository.findByNormalizedName(restaurantId, normalizeTableName(name));
    if (duplicate) throw new ConflictError(`Já existe a mesa ${duplicate.name}`);
  }
}
