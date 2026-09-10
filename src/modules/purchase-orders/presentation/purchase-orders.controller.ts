import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IPurchaseOrderRepository } from '../domain/repositories/purchase-order.repository.interface';
import { IReceivePurchaseOrderService } from '../domain/services/i-receive-purchase-order.service';
import { savePurchaseOrderSchema } from './purchase-order.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0015-estoque-compras REQ-2/REQ-3/REQ-7 — pedidos de compra do restaurante do operador
 * logado. `PATCH .../receive` delega pra `ReceivePurchaseOrderService` (regra de REQ-3/REQ-7
 * isolada, testável sem HTTP).
 */
export class PurchaseOrdersController extends BaseRouter {
  constructor(
    private readonly purchaseOrderRepository: IPurchaseOrderRepository,
    private readonly receivePurchaseOrderService: IReceivePurchaseOrderService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-3/T005 — pedidos de compra é `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/purchase-orders', ...authenticated, async (req: Request, res: Response) => {
      const orders = await this.purchaseOrderRepository.listByRestaurant(req.restaurantId!);
      res.json(200, orders);
    });

    // AC-2 — status `aberto` e `totalValue` calculados na criação.
    application.post('/restaurants/me/purchase-orders', ...authenticated, async (req: Request, res: Response) => {
      const { supplierId, items } = parseBody(savePurchaseOrderSchema, req.body);
      const order = await this.purchaseOrderRepository.create(req.restaurantId!, supplierId, items);
      res.json(201, order);
    });

    // AC-3/AC-7
    application.patch(
      '/restaurants/me/purchase-orders/:id/receive',
      ...authenticated,
      async (req: Request, res: Response) => {
        const order = await this.receivePurchaseOrderService.receive(req.params.id, req.restaurantId!);
        res.json(200, order);
      },
    );
  }
}
