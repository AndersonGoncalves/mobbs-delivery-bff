import type { Request, Response, Server } from 'restify';
import { BadRequestError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrder } from '../domain/entities/order.entity';
import { isOrderCancellable, isValidOrderStatusTransition } from '../domain/order-status-transitions';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { cancelOrderWithReasonSchema, createOrderSchema, salesSummaryQuerySchema, updateOrderStatusSchema } from './orders.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * REQ-2 (`specs/0005-checkout`) — qualquer `Customer` autenticado pode criar um pedido pra
 * qualquer restaurante (não é rota de retaguarda, mesmo raciocínio de `CatalogController`): sem
 * `restaurantOperatorMiddleware`, `restaurantId` vem do corpo, `customerId` vem do próprio token
 * (`req.user!.uid` — `Customer.id` no app **é** o uid do Firebase, `modules/auth` no cliente
 * nunca persiste um id próprio).
 *
 * `subtotal`/`deliveryFee`/`total` são **calculados aqui**, nunca aceitos do corpo da requisição
 * — o cliente manda só os itens (com `unitPrice` já congelado da tela de produto, `specs/0003`/
 * `0004`) e o tipo de pedido; confiar no cliente pra dizer o próprio total seria um jeito fácil
 * de manipular o valor pago.
 */
export class OrdersController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/orders', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const payload = parseBody(createOrderSchema, req.body);

      const restaurant = await this.restaurantRepository.findById(payload.restaurantId);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const subtotal = payload.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const deliveryFee = payload.orderType === 'delivery' ? restaurant.deliveryFeeCents : 0;
      const discount = 0;
      const total = subtotal + deliveryFee - discount;

      const order = await this.orderRepository.create({
        customerId: req.user!.uid,
        restaurantId: payload.restaurantId,
        items: payload.items,
        orderType: payload.orderType,
        deliveryAddress: payload.deliveryAddress,
        notes: payload.notes,
        subtotal,
        deliveryFee,
        discount,
        total,
        paymentMethod: payload.paymentMethod,
        cardBrand: payload.cardBrand,
      });

      res.json(201, order);
    });

    // REQ-1 (`specs/0006-acompanhamento-pedido`) — pedidos do próprio cliente, mais recente
    // primeiro (`OrderMongooseRepository.findManyByCustomer`); separar em andamento/histórico é
    // responsabilidade da apresentação (app), não do BFF.
    application.get('/orders', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const orders = await this.orderRepository.findManyByCustomer(req.user!.uid);
      res.json(200, orders);
    });

    // REQ-2 — só o dono do pedido pode ver o detalhe (nunca por id de outro cliente).
    application.get('/orders/:id', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const order = await this.findOwnedOrder(req.params.id, req.user!.uid);
      res.json(200, order);
    });

    // REQ-6: só cancela em `aguardandoConfirmacao` — a partir de `confirmado` o cliente precisa
    // contatar o restaurante (REQ-7), não cancela mais sozinho pelo app
    // (`docs/architecture/data-model.md`, "Cancelamento pelo próprio cliente").
    application.patch('/orders/:id/cancel', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const order = await this.findOwnedOrder(req.params.id, req.user!.uid);
      if (order.status !== 'aguardandoConfirmacao') {
        throw new BadRequestError('Pedido não pode mais ser cancelado');
      }
      const updated = await this.orderRepository.updateStatus(order.id, 'cancelado', req.user!.uid);
      res.json(200, updated);
    });

    const operatorAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    // specs/0008-acompanhamento-vendas REQ-1 — pedidos em andamento do restaurante do operador
    // logado (mais antigo primeiro, `findActiveByRestaurant`); nunca por parâmetro de rota
    // (isolamento multi-tenant, mesmo padrão de `specs/0007`/`0010`).
    application.get('/restaurants/me/orders', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const orders = await this.orderRepository.findActiveByRestaurant(req.restaurantId!);
      res.json(200, orders);
    });

    // REQ-2/REQ-5: só avança um passo por vez (`isValidOrderStatusTransition`) — fonte de
    // verdade da regra é o BFF, a retaguarda só espelha pra feedback imediato (plan.md, ADR).
    application.patch(
      '/restaurants/me/orders/:id/status',
      ...operatorAuthenticated,
      async (req: Request, res: Response) => {
        const { status } = parseBody(updateOrderStatusSchema, req.body);
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);

        if (!isValidOrderStatusTransition(order.status, status)) {
          throw new BadRequestError(`Não é possível mudar de "${order.status}" para "${status}"`);
        }

        const updated = await this.orderRepository.updateStatus(order.id, status, req.restaurantId);
        res.json(200, updated);
      },
    );

    // REQ-3: cancelamento pela retaguarda exige motivo (registrado na linha do tempo) e é
    // permitido num conjunto de estados mais amplo que o autocancelamento do cliente
    // (`isOrderCancellable`, specs/0006 REQ-6 é mais restrito).
    application.patch(
      '/restaurants/me/orders/:id/cancel',
      ...operatorAuthenticated,
      async (req: Request, res: Response) => {
        const { reason } = parseBody(cancelOrderWithReasonSchema, req.body);
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);

        if (!isOrderCancellable(order.status)) {
          throw new BadRequestError('Pedido não pode mais ser cancelado');
        }

        const updated = await this.orderRepository.updateStatus(order.id, 'cancelado', req.restaurantId, reason);
        res.json(200, updated);
      },
    );

    // REQ-4 — agregado calculado on demand, sempre escopado ao restaurante do operador logado
    // (nunca por parâmetro de rota).
    application.get('/restaurants/me/sales-summary', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(salesSummaryQuerySchema, req.query);
      const summary = await this.orderRepository.getSalesSummary(req.restaurantId!, new Date(from), new Date(to));
      res.json(200, summary);
    });

    // REQ-8: rota **pública** (sem `firebaseAuthMiddleware`) — resolve só pelo `trackingToken`
    // (aleatório, não sequencial), nunca pelo `id`; devolve um subconjunto do pedido (sem
    // `customerId`/`restaurantId`/`deliveryAddress`, que identificariam o cliente).
    application.get('/orders/track/:token', async (req: Request, res: Response) => {
      const order = await this.orderRepository.findByTrackingToken(req.params.token);
      const found = this.render(order);
      res.json(200, this.toPublicView(found));
    });
  }

  private async findOwnedOrder(id: string, customerId: string): Promise<IOrder> {
    const order = await this.orderRepository.findById(id);
    if (!order || order.customerId !== customerId) throw new NotFoundError('Pedido não encontrado');
    return order;
  }

  private async findOwnedOrderForRestaurant(id: string, restaurantId: string): Promise<IOrder> {
    const order = await this.orderRepository.findById(id);
    if (!order || order.restaurantId !== restaurantId) throw new NotFoundError('Pedido não encontrado');
    return order;
  }

  private toPublicView(order: IOrder) {
    return {
      orderNumber: order.orderNumber,
      items: order.items,
      orderType: order.orderType,
      status: order.status,
      statusHistory: order.statusHistory,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      createdAt: order.createdAt,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
    };
  }
}
