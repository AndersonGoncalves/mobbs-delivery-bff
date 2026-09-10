import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrder, IPayment } from '../domain/entities/order.entity';
import { isOrderCancellable, isValidOrderStatusTransition } from '../domain/order-status-transitions';
import { buildPixBrCode } from '../domain/pix-br-code-builder';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
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
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
    private readonly cashRegisterService: ICashRegisterService,
    private readonly paymentRepository: IPaymentRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/orders', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const payload = parseBody(createOrderSchema, req.body);

      const restaurant = await this.restaurantRepository.findById(payload.restaurantId);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      // specs/0020-pix-no-app REQ-3 — Pix só é uma opção válida quando o restaurante tem chave
      // cadastrada; o app já esconde a opção nesse caso (defesa em profundidade, nunca confiar só
      // no client — mesmo raciocínio de `cardBrand` obrigatório pra cartão, no schema acima).
      if (payload.paymentMethod === 'pix' && !restaurant.pixKey) {
        throw new BadRequestError('Restaurante não tem chave Pix cadastrada');
      }

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

      // specs/0013-notificacoes-whatsapp REQ-1/REQ-4 — fire-and-forget: nunca bloqueia a
      // resposta HTTP nem reverte a criação do pedido se o envio falhar (o serviço já engole
      // qualquer exceção internamente, `.catch` aqui é só uma segunda rede de segurança).
      void this.whatsAppNotificationService.sendOrderReceipt(order, payload.cardBrand).catch((error) => {
        console.error(`[whatsapp] erro inesperado enviando recibo do pedido ${order.id}:`, error);
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
    // specs/0020-pix-no-app REQ-2/REQ-5/T002/T006 — inclui `payment.status` sempre, e o
    // `pixCode` (copia-e-cola) só enquanto `paymentMethod == pix` e o pagamento ainda está
    // `pendente` (some depois de confirmado, evita pagamento duplicado por engano).
    application.get('/orders/:id', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const order = await this.findOwnedOrder(req.params.id, req.user!.uid);
      res.json(200, await this.attachPaymentDetails(order));
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

      void this.whatsAppNotificationService.sendOrderStatusUpdate(updated).catch((error) => {
        console.error(`[whatsapp] erro inesperado enviando atualização de status do pedido ${updated.id}:`, error);
      });

      res.json(200, updated);
    });

    // specs/0021-papeis-operador REQ-3/T005 — pedidos gerais é `dono`/`gerente` (sem
    // `financeiro`, AC-7 — "mesmo sem acesso ao módulo de pedidos em geral"); a confirmação de
    // Pix abaixo (T007) é a única rota deste controller com uma lista de papéis diferente.
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // specs/0008-acompanhamento-vendas REQ-1 — pedidos em andamento do restaurante do operador
    // logado (mais antigo primeiro, `findActiveByRestaurant`); nunca por parâmetro de rota
    // (isolamento multi-tenant, mesmo padrão de `specs/0007`/`0010`).
    // specs/0020-pix-no-app T006 — inclui `payment.status` em cada pedido, pra retaguarda saber
    // quais estão com Pix pendente de confirmação (`ActiveOrdersPage`, mobbs-delivery-web).
    application.get('/restaurants/me/orders', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const orders = await this.orderRepository.findActiveByRestaurant(req.restaurantId!);
      res.json(200, await this.attachPaymentSummaries(orders));
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

        // specs/0013-notificacoes-whatsapp REQ-2/REQ-4 — mesma lógica fire-and-forget do REQ-1.
        void this.whatsAppNotificationService.sendOrderStatusUpdate(updated).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando atualização de status do pedido ${updated.id}:`, error);
        });

        // specs/0014-financeiro REQ-5 — só ao chegar em "entregue" (cobre tanto delivery quanto
        // retirada, `docs/architecture/data-model.md` não tem status separado pros dois); a
        // regra de "só Pix" e "só com sessão de caixa aberta" fica inteira dentro do serviço
        // (`CashRegisterService`), não aqui. `await`ado (não fire-and-forget como o WhatsApp
        // acima) mas protegido por try/catch: uma falha na contabilização automática nunca
        // reverte nem falha a resposta da mudança de status, que já foi persistida.
        if (status === 'entregue') {
          try {
            await this.cashRegisterService.addAutomaticEntry({
              restaurantId: updated.restaurantId,
              orderId: updated.id,
              orderNumber: updated.orderNumber,
              amount: updated.total,
              paymentMethod: updated.paymentMethod,
            });
          } catch (error) {
            console.error(`[financeiro] erro inesperado lançando movimento automático de caixa do pedido ${updated.id}:`, error);
          }
        }

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

        void this.whatsAppNotificationService.sendOrderStatusUpdate(updated, reason).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando atualização de status do pedido ${updated.id}:`, error);
        });

        res.json(200, updated);
      },
    );

    // specs/0021-papeis-operador REQ-3/REQ-4/T007 — confirmar Pix aceita os três papéis
    // (`dono`/`gerente`/`financeiro`): é a única exceção dentro de "pedidos gerais" (que só
    // `dono`/`gerente` acessam) — decisão de design (plan.md, ADR): ação com faces operacional
    // (fechar o pedido) e financeira (confirmar recebimento) ao mesmo tempo.
    const paymentConfirmAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    // specs/0020-pix-no-app REQ-4/REQ-5/T005 — confirmação manual do Pix pelo operador (sem
    // gateway/webhook): só válida quando `Payment.method == 'pix'` e `status == 'pendente'`
    // (senão 409, mesmo padrão de erro já usado em `specs/0014`/`specs/0015` pra transições
    // inválidas — ex. `ReceivePurchaseOrderService`).
    application.patch(
      '/restaurants/me/orders/:id/payment/confirm',
      ...paymentConfirmAuthenticated,
      async (req: Request, res: Response) => {
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);
        const payment = await this.paymentRepository.findByOrderId(order.id);

        if (!payment || payment.method !== 'pix' || payment.status !== 'pendente') {
          throw new ConflictError('Pagamento não pode ser confirmado');
        }

        const updatedPayment = await this.paymentRepository.markAsApproved(order.id);

        res.json(200, { ...order, payment: this.toPaymentSummary(updatedPayment) });
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

  private toPaymentSummary(payment: IPayment): Pick<IPayment, 'method' | 'status'> {
    return { method: payment.method, status: payment.status };
  }

  /**
   * specs/0020-pix-no-app T002/T006 — usado só em `GET /orders/:id` (detalhe): inclui
   * `payment.status` sempre que existir `Payment` associado, e `pixCode` (copia-e-cola EMV/BR
   * Code) só quando `paymentMethod == 'pix'` e o pagamento ainda está `pendente` — depois de
   * confirmado (REQ-5), o código some da resposta (não só da tela) pra evitar pagamento
   * duplicado por engano.
   */
  private async attachPaymentDetails(order: IOrder): Promise<IOrder & { payment?: Pick<IPayment, 'method' | 'status'>; pixCode?: string }> {
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) return order;

    let pixCode: string | undefined;
    if (order.paymentMethod === 'pix' && payment.status === 'pendente') {
      const restaurant = await this.restaurantRepository.findById(order.restaurantId);
      if (restaurant?.pixKey) {
        pixCode = buildPixBrCode({
          pixKey: restaurant.pixKey,
          merchantName: restaurant.pixBeneficiaryName || restaurant.name,
          merchantCity: restaurant.address?.city ?? 'BRASIL',
          amount: order.total,
          txId: order.id,
        });
      }
    }

    return { ...order, payment: this.toPaymentSummary(payment), pixCode };
  }

  /** specs/0020-pix-no-app T006 — usado nas listagens (`GET /restaurants/me/orders`): só `payment.status`, sem `pixCode` (fica só no detalhe, REQ-2). */
  private async attachPaymentSummaries(orders: IOrder[]): Promise<(IOrder & { payment?: Pick<IPayment, 'method' | 'status'> })[]> {
    const payments = await this.paymentRepository.findManyByOrderIds(orders.map((order) => order.id));
    const paymentByOrderId = new Map(payments.map((payment) => [payment.orderId, payment]));

    return orders.map((order) => {
      const payment = paymentByOrderId.get(order.id);
      return payment ? { ...order, payment: this.toPaymentSummary(payment) } : order;
    });
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
