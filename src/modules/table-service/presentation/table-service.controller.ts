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
import { StockReservationService } from '../../orders/domain/services/stock-reservation.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { FiscalEmissionService } from '../../fiscal-integration/domain/services/fiscal-emission.service';
import { OverpaymentRequiresConfirmationError, TableOrderService } from '../domain/services/table-order.service';
import { isFiscalPrintMissed } from '../../orders/domain/is-fiscal-print-missed';
import { isAutoPrintMissed } from '../../orders/domain/is-auto-print-missed';
import {
  addTableOrderItemSchema,
  addTablePaymentSchema,
  cancelTableOrderSchema,
  closeTableOrderSchema,
  createTableRangeSchema,
  openTableOrderSchema,
  saveTableMapLayoutSchema,
  saveTableSchema,
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
    private readonly restaurantRepository: IRestaurantRepository,
    stockReservationService: StockReservationService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // specs/0137-papeis-garcom-motoboy REQ-7 — seletor de garçom da mesa passa a listar
    // `RestaurantOperator` com papel `garcom`.
    restaurantOperatorRepository: IRestaurantOperatorRepository,
    private readonly cashRegisterService?: ICashRegisterService,
    // specs/0202-emissao-fiscal-pedidos-mesa.
    private readonly fiscalEmissionService?: FiscalEmissionService,
  ) {
    super();
    this.tableOrders = new TableOrderService(
      orderRepository, tableRepository, waiterRepository, layoutRepository, productRepository, customerRepository,
      restaurantRepository, stockReservationService, restaurantOperatorRepository, cashRegisterService,
      fiscalEmissionService,
    );
  }

  private readonly tableOrders: TableOrderService;

  initializeRoutes(application: Server): void {
    // specs/0137-papeis-garcom-motoboy REQ-2 — `garcom` acessa as rotas de atendimento;
    // cadastro/edição de mesas e do layout continuam restritos a dono/gerente.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro', 'garcom'),
    ];
    const tableManagementAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/table-service/map', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.getFloor(req.restaurantId!));
    });

    application.get('/restaurants/me/table-orders/active', ...authenticated, async (req: Request, res: Response) => {
      const orders = await this.tableOrders.getActiveOrders(req.restaurantId!);
      // Pedido explícito do usuário (16/11/2026) — ver `isFiscalPrintMissed`.
      res.json(200, orders.map((order) => ({ ...order, fiscalPrintMissed: isFiscalPrintMissed(order) })));
    });

    application.post('/restaurants/me/table-orders', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(openTableOrderSchema, req.body);
      res.json(201, await this.tableOrders.openOrder(req.restaurantId!, input));
    });

    application.get('/restaurants/me/table-orders/history', ...authenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(tableOrderHistoryQuerySchema, req.query);
      const [orders, restaurant] = await Promise.all([
        this.tableOrders.getClosedHistory(req.restaurantId!, new Date(from), new Date(to)),
        this.restaurantRepository.findById(req.restaurantId!),
      ]);
      // Pedido explícito do usuário (16/11/2026) — ver `isFiscalPrintMissed`.
      // Pedido explícito do usuário (17/11/2026) — ver `isAutoPrintMissed`: mesa fechada há mais
      // tempo que `autoPrintMaxAgeMinutes` sem a comanda impressa, pro operador saber que precisa
      // imprimir manualmente (tela "Fechados").
      const maxAgeMinutes = restaurant!.autoPrintMaxAgeMinutes ?? 5;
      res.json(200, orders.map((order) => ({ ...order, fiscalPrintMissed: isFiscalPrintMissed(order), autoPrintMissed: isAutoPrintMissed(order, maxAgeMinutes) })));
    });

    application.get('/restaurants/me/table-orders/:id', ...authenticated, async (req: Request, res: Response) => {
      const [order, restaurant] = await Promise.all([
        this.tableOrders.getOrder(req.restaurantId!, req.params.id),
        this.restaurantRepository.findById(req.restaurantId!),
      ]);
      // Pedido explícito do usuário (17/11/2026) — mesma checagem de `isAutoPrintMissed`/
      // `isFiscalPrintMissed` das listas acima, aqui pro frontend reconsultar UM pedido específico
      // (ex. logo depois de fechar a mesa) sem precisar buscar a lista inteira de novo.
      const maxAgeMinutes = restaurant!.autoPrintMaxAgeMinutes ?? 5;
      res.json(200, { ...order, fiscalPrintMissed: isFiscalPrintMissed(order), autoPrintMissed: isAutoPrintMissed(order, maxAgeMinutes) });
    });

    application.post('/restaurants/me/table-orders/:id/items', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(addTableOrderItemSchema, req.body);
      res.json(200, await this.tableOrders.addItem(req.restaurantId!, req.params.id, input));
    });

    // specs/0214-estorno-sobrepagamento-mesa REQ-1/REQ-2 — `OverpaymentRequiresConfirmationError`
    // (lançada dentro de `TableOrderService`, onde a checagem de totais já acontece) vira
    // `409 { requiresConfirmation: true, ... }`, mesmo contrato já usado em
    // `raw-materials`/`additional-group-templates` pro operador decidir confirmar ou não.
    application.patch('/restaurants/me/table-orders/:id/items/:itemId/quantity', ...authenticated, async (req: Request, res: Response) => {
      const { quantity, operationId, confirmed } = parseBody(updateTableOrderItemQuantitySchema, req.body);
      try {
        res.json(200, await this.tableOrders.setItemQuantity(req.restaurantId!, req.params.id, req.params.itemId, quantity, operationId, confirmed));
      } catch (error) {
        if (error instanceof OverpaymentRequiresConfirmationError) {
          res.json(409, { requiresConfirmation: true, alreadyPaid: error.alreadyPaid, newTotal: error.newTotal, excess: error.excess });
          return;
        }
        throw error;
      }
    });

    application.post('/restaurants/me/table-orders/:id/items/group', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableOrders.groupDuplicateItems(req.restaurantId!, req.params.id));
    });

    application.patch('/restaurants/me/table-orders/:id/adjustments', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(tableOrderAdjustmentsSchema, req.body);
      try {
        res.json(200, await this.tableOrders.updateAdjustments(req.restaurantId!, req.params.id, input));
      } catch (error) {
        if (error instanceof OverpaymentRequiresConfirmationError) {
          res.json(409, { requiresConfirmation: true, alreadyPaid: error.alreadyPaid, newTotal: error.newTotal, excess: error.excess });
          return;
        }
        throw error;
      }
    });

    application.post('/restaurants/me/table-orders/:id/payments', ...authenticated, async (req: Request, res: Response) => {
      const { method, amount } = parseBody(addTablePaymentSchema, req.body);
      res.json(200, await this.tableOrders.addPartialPayment(req.restaurantId!, req.params.id, method, amount, req.user!.uid));
    });

    application.post('/restaurants/me/table-orders/:id/close', ...authenticated, async (req: Request, res: Response) => {
      const { payments, clientRequestId } = parseBody(closeTableOrderSchema, req.body);
      res.json(200, await this.tableOrders.closeOrder(req.restaurantId!, req.params.id, payments, req.user!.uid, clientRequestId));
    });

    application.post('/restaurants/me/table-orders/:id/transfer', ...authenticated, async (req: Request, res: Response) => {
      const { tableId } = parseBody(transferTableOrderSchema, req.body);
      res.json(200, await this.tableOrders.transferOrder(req.restaurantId!, req.params.id, tableId));
    });

    application.post('/restaurants/me/table-orders/:id/merge', ...authenticated, async (req: Request, res: Response) => {
      const { orderId } = parseBody(tableOrderIdSchema, req.body);
      res.json(200, await this.tableOrders.mergeOrders(req.restaurantId!, req.params.id, orderId));
    });

    // specs/0214-estorno-sobrepagamento-mesa REQ-6/REQ-9 — restrito a dono/gerente (mesma
    // restrição de `tableManagementAuthenticated`, reaproveitada — não é cadastro de mesa, mas é
    // o mesmo par de papéis exigido), diferente de `authenticated` (que também libera
    // financeiro/garçom pro resto do atendimento).
    application.patch('/restaurants/me/table-orders/:id/cancel', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const { reason } = parseBody(cancelTableOrderSchema, req.body);
      res.json(200, await this.tableOrders.cancelOrder(req.restaurantId!, req.params.id, reason, req.user!.uid));
    });

    application.get('/restaurants/me/tables', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      res.json(200, await this.tableRepository.listByRestaurant(req.restaurantId!));
    });

    application.post('/restaurants/me/tables', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveTableSchema, req.body);
      await this.ensureNameAvailable(req.restaurantId!, input.name);
      res.json(201, await this.tableRepository.create(req.restaurantId!, input));
    });

    application.post('/restaurants/me/tables/range', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(createTableRangeSchema, req.body);
      const inputs = Array.from({ length: to - from + 1 }, (_, index) => ({ name: String(from + index) }));
      const existingNames = new Set((await this.tableRepository.listByRestaurant(req.restaurantId!)).map((table) => table.normalizedName));
      const duplicate = inputs.find((input) => existingNames.has(normalizeTableName(input.name)));
      if (duplicate) throw new ConflictError(`Já existe a mesa ${duplicate.name}`);
      res.json(201, await this.tableRepository.createMany(req.restaurantId!, inputs));
    });

    application.put('/restaurants/me/tables/:id', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveTableSchema, req.body);
      const current = await this.findTable(req.params.id, req.restaurantId!);
      if (normalizeTableName(current.name) !== normalizeTableName(input.name)) {
        await this.ensureNameAvailable(req.restaurantId!, input.name);
      }
      const updated = await this.tableRepository.update(current.id, req.restaurantId!, input);
      res.json(200, updated);
    });

    application.put('/restaurants/me/tables/:id/position', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const { position } = parseBody(updateTablePositionSchema, req.body);
      const table = await this.findTable(req.params.id, req.restaurantId!);
      const updated = await this.tableRepository.updatePosition(table.id, req.restaurantId!, position);
      res.json(200, updated);
    });

    application.del('/restaurants/me/tables/:id', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      await this.findTable(req.params.id, req.restaurantId!);
      const deleted = await this.tableRepository.deleteIfFree(req.params.id, req.restaurantId!);
      if (!deleted) throw new ConflictError('Mesa ocupada não pode ser excluída');
      res.send(204);
    });

    application.get('/restaurants/me/table-map/layout', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.layoutRepository.getByRestaurant(req.restaurantId!));
    });

    application.put('/restaurants/me/table-map/layout', ...tableManagementAuthenticated, async (req: Request, res: Response) => {
      const { decorations, spendingLimit, counterPositions, liveMusicDays } = parseBody(saveTableMapLayoutSchema, req.body);
      const normalized = decorations.map((decoration) => ({ ...decoration, id: decoration.id ?? randomUUID() }));
      res.json(200, await this.layoutRepository.save(req.restaurantId!, normalized, spendingLimit, counterPositions, liveMusicDays));
    });

    // (ajuste, pedido explícito do usuário) — "Cadastro de garçons" (web) virou só leitura,
    // listando `RestaurantOperator` com papel `garcom` (ver `restaurant-operators.controller.ts`,
    // `GET /restaurants/me/operators/waiters`); POST/PUT/DELETE deste cadastro legado
    // (`TableWaiter`, specs/0120) saíram daqui porque nada mais os chama — ninguém mais cria,
    // edita ou remove um `TableWaiter`. O GET continua existindo (dado antigo não foi apagado do
    // banco), só não tem mais consumidor na web.
    application.get('/restaurants/me/waiters', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.waiterRepository.listByRestaurant(req.restaurantId!));
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
