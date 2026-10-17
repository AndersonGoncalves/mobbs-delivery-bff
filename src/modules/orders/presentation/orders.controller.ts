import { isBillingBlocked } from '../../billing/domain/billing';
import { randomUUID } from 'crypto';
import { BillingBlockedError } from '../../../shared/http/billing-blocked.error';
import { findDeliveryFeeZone } from '../../restaurants/domain/find-delivery-fee-zone';
import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { ICouponRepository } from '../../coupons/domain/repositories/coupon.repository.interface';
import { validateCoupon } from '../../coupons/domain/services/coupon-validator';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { buildNewOrderRestaurantMessage, DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE } from '../../notifications/domain/new-order-restaurant-message-builder';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { isRestaurantOpenNow } from '../../restaurants/domain/is-restaurant-open-now';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrder, IOrderItem, IPayment } from '../domain/entities/order.entity';
import { StockReservationService } from '../domain/services/stock-reservation.service';
import { isOrderCancellable, isValidOrderStatusTransition } from '../domain/order-status-transitions';
import { buildOrderPixCode } from '../domain/build-order-pix-code';
import { resolveOrderItemLinkedProducts } from '../domain/resolve-order-item-linked-products';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IRestaurantTableRepository } from '../../table-service/domain/repositories/table.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { isValidCellphone } from '../../../shared/utils/is-valid-cellphone';
import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';
import { assignOrderMotoboySchema, cancelOrderWithReasonSchema, createOrderSchema, salesSummaryQuerySchema, updateOrderStatusSchema } from './orders.schemas';

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
  private readonly stockReservationService?: StockReservationService;

  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
    private readonly cashRegisterService: ICashRegisterService,
    private readonly paymentRepository: IPaymentRepository,
    private readonly couponRepository: ICouponRepository,
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16.
    private readonly productRepository: IProductRepository,
    stockMovementRepository: IStockMovementRepository,
    // specs/0062-confirmar-pedido-whatsapp-restaurante — só pro `customerName` da mensagem de
    // aviso; `IOrder` não guarda o nome do cliente.
    private readonly customerRepository: ICustomerRepository,
    // specs/0137-papeis-garcom-motoboy REQ-6 — valida a atribuição contra o `RestaurantOperator`
    // com papel `motoboy` do restaurante autenticado (antes validava contra `IMotoboyRepository`,
    // o cadastro informativo de `specs/0119`, que continua existindo em paralelo sem relação com
    // atribuição de pedido).
    private readonly restaurantOperatorRepository: IRestaurantOperatorRepository,
    // specs/0042 REQ-2/REQ-3/REQ-4 — recalcula a faixa de faturamento quando um pedido vira `entregue`.
    private readonly recomputeRestaurantBilling?: { call(restaurantId: string): Promise<void> },
    private readonly tableRepository?: IRestaurantTableRepository,
    rawMaterialRepository?: IRawMaterialRepository,
    // Pedido explícito do usuário (módulo `customer-blocking`) — checagem em profundidade no
    // momento do pedido, nunca confia só no app esconder a opção.
    private readonly blockedCustomerRepository?: IBlockedCustomerRepository,
  ) {
    super();
    if (rawMaterialRepository) {
      this.stockReservationService = new StockReservationService(productRepository, rawMaterialRepository, stockMovementRepository);
    }
  }

  initializeRoutes(application: Server): void {
    application.post('/orders', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const payload = parseBody(createOrderSchema, req.body);
      const idempotencyKey = payload.idempotencyKey ?? randomUUID();
      const existingOrder = await this.orderRepository.findByIdempotencyKey(req.restaurantId ?? payload.restaurantId, req.user!.uid, idempotencyKey);
      if (existingOrder) {
        res.json(200, existingOrder);
        return;
      }

      const restaurant = await this.restaurantRepository.findById(payload.restaurantId);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      // specs/0042 REQ-7 — restaurante inadimplente não recebe pedido novo, mesmo chamando a API direto.
      if (isBillingBlocked(restaurant.billing)) throw new BillingBlockedError();

      // Pedido precisa de nome e WhatsApp válido do cliente: sem WhatsApp o restaurante não recebe a
      // confirmação. O app já bloqueia no checkout, mas nunca confia só no client.
      const customer = await this.customerRepository.findById(req.user!.uid);
      if (!customer?.name?.trim() || !isValidCellphone(customer.phone)) {
        throw new BadRequestError('Informe seu nome e WhatsApp antes de fazer o pedido');
      }

      // Pedido explícito do usuário (módulo `customer-blocking`) — liga/desliga do restaurante
      // (`customerBlockingEnabled`) governa se a lista de bloqueados é sequer consultada.
      if (restaurant.customerBlockingEnabled && this.blockedCustomerRepository) {
        const blocked = await this.blockedCustomerRepository.isBlocked(restaurant.id, normalizePhoneNumber(customer.phone!));
        if (blocked) throw new ForbiddenError('Não é possível fazer pedidos neste restaurante');
      }

      // specs/0055-checkout-revalida-restaurante-aberto (reabre 0046/0033-REQ-7) — nunca confia
      // só no client achar que a loja está aberta: a tela de checkout pode ter sido aberta antes
      // do restaurante fechar (manualmente ou por horário). Revalida aqui, mesma regra de
      // Restaurant.isOpenAt() no app (isActive tem prioridade sobre businessHours).
      if (!isRestaurantOpenNow(restaurant)) {
        throw new ConflictError('Restaurante fechado no momento');
      }

      // specs/0083-modalidade-entrega-retirada-restaurante REQ-5 — defesa em profundidade: o app já
      // só oferece as modalidades permitidas, mas nunca confia só no client.
      if (!restaurant.orderTypes.includes(payload.orderType)) {
        throw new BadRequestError('Este restaurante não aceita esta modalidade de pedido');
      }

      // specs/0020-pix-no-app REQ-3 — Pix só é uma opção válida quando o restaurante tem chave
      // cadastrada; o app já esconde a opção nesse caso (defesa em profundidade, nunca confiar só
      // no client — mesmo raciocínio de `cardBrand` obrigatório pra cartão, no schema acima).
      if (payload.paymentMethod === 'pix' && !restaurant.pixKey) {
        throw new BadRequestError('Restaurante não tem chave Pix cadastrada');
      }

      const subtotal = payload.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — 'free' nunca cobra,
      // independente do que estiver em `deliveryFeeCents` (o restaurante pode ter mudado de modo
      // sem zerar o valor antigo). Por bairro, a taxa é a da zona do bairro escolhido — mesma regra que
      // o app mostra no checkout (`GET /restaurants/:id/delivery-fee`) — e sem zona o pedido não fecha.
      const deliveryFee = resolveDeliveryFee(restaurant, payload);

      // specs/0022-cupons-desconto REQ-2/REQ-4 — primeiro consumidor real de `Order.discount`
      // (antes hardcoded em `0`). **Nunca confia no desconto calculado pelo app**: revalida tudo
      // de novo aqui, mesmo que o cliente já tenha "aplicado" o cupom antes via
      // `POST /restaurants/:id/coupons/validate` (feedback de UX, não fonte de verdade).
      const { discount, couponCode } = await this.applyCoupon(payload.couponCode, payload.restaurantId, req.user!.uid, subtotal);
      const total = subtotal + deliveryFee - discount;

      // Resolve os vínculos atuais e reserva saldo antes de aceitar o pedido. O corpo enviado pelo
      // cliente nunca fornece ids de estoque; só nomes de grupo/opção são casados com o catálogo.
      const resolvedItems = await this.resolveItemsLinkedProducts(payload.items);
      const orderId = randomUUID();
      const items = restaurant.stockControlEnabled
        ? await this.requireStockReservationService().reserveOrderItems(
            restaurant.id,
            resolvedItems,
            true,
            orderId,
            idempotencyKey,
          )
        : resolvedItems;

      // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-3 — Pix nunca nasce confirmado
      // aqui (só confirma depois do pagamento aprovado, REQ-4); as demais formas nascem
      // `confirmado` direto se estiverem na configuração de auto-confirmação do restaurante.
      const initialStatus =
        payload.paymentMethod !== 'pix' && restaurant.autoConfirmPaymentMethods?.includes(payload.paymentMethod)
          ? 'confirmado'
          : undefined;

      let order: IOrder;
      try {
        order = await this.orderRepository.create({
        id: orderId,
        idempotencyKey,
        customerId: req.user!.uid,
        restaurantId: payload.restaurantId,
        items,
        orderType: payload.orderType,
        deliveryAddress: payload.deliveryAddress,
        notes: payload.notes,
        subtotal,
        deliveryFee,
        discount,
        total,
        couponCode,
        paymentMethod: payload.paymentMethod,
        cardBrand: payload.cardBrand,
        cashChangeFor: payload.cashChangeFor,
        initialStatus,
      });
      } catch (error) {
        const alreadyCreated = await this.orderRepository.findByIdempotencyKey(restaurant.id, req.user!.uid, idempotencyKey);
        if (alreadyCreated) {
          if (restaurant.stockControlEnabled) {
            await this.requireStockReservationService().releaseReservationsNotAttachedToOrder(
              restaurant.id,
              orderId,
              items,
              alreadyCreated.items,
            );
          }
          res.json(200, alreadyCreated);
          return;
        }
        if (restaurant.stockControlEnabled) {
          await this.requireStockReservationService().releaseOrderReservations(restaurant.id, orderId, items);
        }
        throw error;
      }

      // specs/0013-notificacoes-whatsapp REQ-1/REQ-4 — fire-and-forget: nunca bloqueia a
      // resposta HTTP nem reverte a criação do pedido se o envio falhar (o serviço já engole
      // qualquer exceção internamente, `.catch`/try-catch aqui é só uma segunda rede de
      // segurança).
      //
      // Achado real (pedido explícito do usuário) — recibo e confirmação automática (abaixo)
      // eram disparados em paralelo, cada um com seu próprio `void ...catch(...)`, sem relação de
      // ordem entre si; a ordem de CHEGADA no WhatsApp dependia de qual chamada respondia mais
      // rápido, não da ordem em que foram disparadas — a de confirmação (mensagem mais simples)
      // às vezes chegava no chat do cliente antes da de recibo (mais pesada: monta o texto do
      // pedido inteiro + eventual código Pix). Envio em sequência dentro da mesma IIFE
      // fire-and-forget (a resposta HTTP continua sem esperar nenhuma das duas) garante que o
      // recibo sempre termina de ser enviado antes da confirmação começar.
      void (async () => {
        try {
          await this.whatsAppNotificationService.sendOrderReceipt(order, payload.cardBrand);
        } catch (error) {
          console.error(`[whatsapp] erro inesperado enviando recibo do pedido ${order.id}:`, error);
        }

        // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-3 — pedido nasceu já
        // `confirmado` (initialStatus acima): mesma notificação que `PATCH .../orders/:id/status`
        // dispara ao confirmar manualmente, pra não ficar inconsistente entre os dois caminhos.
        if (order.status === 'confirmado') {
          try {
            await this.whatsAppNotificationService.sendOrderStatusUpdate(order);
          } catch (error) {
            console.error(`[whatsapp] erro inesperado enviando confirmação automática do pedido ${order.id}:`, error);
          }
        }
      })();

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

    // specs/0062-confirmar-pedido-whatsapp-restaurante REQ-5/REQ-6 — texto pronto (placeholders já
    // substituídos) pro botão "WhatsApp" (`ContactRestaurantActions`) na tela de detalhe do
    // pedido do app cliente. 404 quando `notifyRestaurantOnNewOrder` está desligado ou o
    // restaurante não tem telefone — mesma regra que decide, do lado do app, se ele passa
    // `buildWhatsAppMessage` pro botão (reforçada aqui no servidor).
    application.get('/orders/:id/whatsapp-confirmation-message', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const order = await this.findOwnedOrder(req.params.id, req.user!.uid);
      const restaurant = await this.restaurantRepository.findById(order.restaurantId);
      if (!restaurant || !restaurant.notifyRestaurantOnNewOrder || !restaurant.phone) {
        throw new NotFoundError('Aviso de pedido novo via WhatsApp não está disponível');
      }
      const customer = await this.customerRepository.findById(order.customerId);

      const text = buildNewOrderRestaurantMessage({
        template: restaurant.newOrderRestaurantWhatsAppTemplate ?? DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE,
        order,
        customerName: customer?.name ?? 'Cliente',
        customerPhone: customer?.phone,
        restaurantSlug: restaurant.slug,
        pixCode: buildOrderPixCode(restaurant, order),
      });

      res.json(200, { text, restaurantPhone: restaurant.phone });
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
      if (order.items.some((item) => (item.stockReservations?.length ?? 0) > 0)) {
        await this.requireStockReservationService().releaseOrderReservations(order.restaurantId, order.id, order.items);
      }

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
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    // specs/0008-acompanhamento-vendas REQ-1 — pedidos em andamento do restaurante do operador
    // logado (mais antigo primeiro, `findActiveByRestaurant`); nunca por parâmetro de rota
    // (isolamento multi-tenant, mesmo padrão de `specs/0007`/`0010`).
    // specs/0020-pix-no-app T006 — inclui `payment.status` em cada pedido, pra retaguarda saber
    // quais estão com Pix pendente de confirmação (`ActiveOrdersPage`, mobbs-delivery-web).
    application.get('/restaurants/me/orders', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const [orders, restaurant] = await Promise.all([
        this.orderRepository.findActiveByRestaurant(req.restaurantId!),
        this.restaurantRepository.findById(req.restaurantId!),
      ]);
      const withCustomersAndPayments = await this.attachCustomers(await this.attachPaymentSummaries(orders));
      // specs/0156-filtro-idade-impressao-automatica REQ-3.
      res.json(200, this.attachAutoPrintMissed(withCustomersAndPayments, restaurant!));
    });

    // specs/0137-papeis-garcom-motoboy REQ-3/AC-3 — próprias entregas ativas do motoboy logado
    // (nunca por parâmetro de rota); exclusivo do papel `motoboy`, não `dono`/`gerente` (que já
    // veem tudo em `GET /restaurants/me/orders` acima).
    application.get(
      '/restaurants/me/orders/my-deliveries',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('motoboy'),
      async (req: Request, res: Response) => {
        const orders = await this.orderRepository.findActiveByRestaurantAndMotoboy(req.restaurantId!, req.operatorId!);
        res.json(200, await this.attachCustomers(orders));
      },
    );

    // specs/0126 REQ-1 — pedidos criados no dia/período pedido pela retaguarda, sem filtrar status.
    // O restaurante vem sempre do operador autenticado; `to` é limite exclusivo.
    application.get('/restaurants/me/orders/map', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { from, to } = parseBody(salesSummaryQuerySchema, req.query);
      const [orders, restaurant] = await Promise.all([
        this.orderRepository.findByRestaurantBetween(req.restaurantId!, new Date(from), new Date(to)),
        this.restaurantRepository.findById(req.restaurantId!),
      ]);
      // specs/0156-filtro-idade-impressao-automatica REQ-3.
      res.json(200, this.attachAutoPrintMissed(await this.attachCustomers(orders), restaurant!));
    });

    // specs/0137-papeis-garcom-motoboy REQ-3 — além de `dono`/`gerente`, `motoboy` também pode
    // chamar esta rota, mas só pra marcar a própria entrega como `entregue` (checagem de posse
    // abaixo); `dono`/`gerente` continuam sem nenhuma restrição extra, como hoje.
    const statusUpdateAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro', 'motoboy'),
    ];

    // REQ-2/REQ-5: só avança um passo por vez (`isValidOrderStatusTransition`) — fonte de
    // verdade da regra é o BFF, a retaguarda só espelha pra feedback imediato (plan.md, ADR).
    application.patch(
      '/restaurants/me/orders/:id/status',
      ...statusUpdateAuthenticated,
      async (req: Request, res: Response) => {
        const { status } = parseBody(updateOrderStatusSchema, req.body);
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);

        // specs/0137-papeis-garcom-motoboy REQ-3/REQ-4 — motoboy só altera o pedido atribuído a
        // ele mesmo (`deliveryMotoboy.id`), e só pra marcar como entregue; nunca o fluxo geral de
        // status que `dono`/`gerente` têm.
        if (req.operatorRole === 'motoboy') {
          if (order.deliveryMotoboy?.id !== req.operatorId) {
            throw new ForbiddenError('Este pedido não está atribuído a você');
          }
          if (status !== 'entregue') {
            throw new ForbiddenError('Motoboy só pode marcar o pedido como entregue');
          }
        }

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
        if (status === 'entregue' && this.recomputeRestaurantBilling) {
          void this.recomputeRestaurantBilling.call(updated.restaurantId).catch((error) => {
            console.error(`[billing] falha ao recalcular faturamento do restaurante ${updated.restaurantId}:`, error);
          });
        }
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

    // specs/0125 — atribuição opcional antes da saída para entrega; não altera status nem permissão
    // futura do motoboy de marcar o pedido como entregue.
    application.patch(
      '/restaurants/me/orders/:id/delivery-motoboy',
      ...operatorAuthenticated,
      async (req: Request, res: Response) => {
        const { motoboyId } = parseBody(assignOrderMotoboySchema, req.body);
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);

        if (order.orderType !== 'delivery' || order.status !== 'emPreparo') {
          throw new BadRequestError('Motoboy só pode ser atribuído a pedido de entrega em preparo');
        }

        let deliveryMotoboy: { id: string; name: string } | undefined;
        if (motoboyId) {
          // specs/0137-papeis-garcom-motoboy REQ-6 — `motoboyId` agora é o id de um
          // `RestaurantOperator` com papel `motoboy`, não mais de um `Motoboy` cadastral.
          const operator = await this.restaurantOperatorRepository.findById(motoboyId);
          if (!operator || operator.restaurantId !== req.restaurantId || operator.role !== 'motoboy' || !operator.isActive) {
            throw new NotFoundError('Motoboy ativo não encontrado');
          }
          // (ajuste, pedido explícito do usuário) — `name || email`, mesmo padrão de `tableWaiter`
          // em `TableOrderService`.
          deliveryMotoboy = { id: operator.id, name: operator.name || operator.email };
        }

        const updated = await this.orderRepository.assignDeliveryMotoboy(order.id, deliveryMotoboy);
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
        if (order.items.some((item) => (item.stockReservations?.length ?? 0) > 0)) {
          await this.requireStockReservationService().releaseOrderReservations(order.restaurantId, order.id, order.items);
        }
        if (order.orderType === 'table' && order.tableId) {
          await this.tableRepository?.releaseFromOrder(order.tableId, req.restaurantId!, order.id);
        }

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

        // specs/0064-notificacao-whatsapp-pix-confirmado REQ-3 — fire-and-forget, mesmo padrão dos
        // outros disparos de WhatsApp deste arquivo: nunca bloqueia nem reverte a confirmação.
        void this.whatsAppNotificationService.sendPaymentConfirmedMessage(order).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando confirmação de pagamento do pedido ${order.id}:`, error);
        });

        // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-4 (finalmente REQ-1a de
        // specs/0140) — Pix confirmado automaticamente avança o pedido direto pra `confirmado`,
        // na mesma chamada, se "Pix" estiver configurado pra isso.
        let updatedOrder = order;
        if (order.status === 'aguardandoConfirmacao') {
          const restaurant = await this.restaurantRepository.findById(order.restaurantId);
          if (restaurant?.autoConfirmPaymentMethods?.includes('pix')) {
            updatedOrder = await this.orderRepository.updateStatus(order.id, 'confirmado', req.restaurantId);
            void this.whatsAppNotificationService.sendOrderStatusUpdate(updatedOrder).catch((error) => {
              console.error(`[whatsapp] erro inesperado enviando confirmação automática do pedido ${updatedOrder.id}:`, error);
            });
          }
        }

        res.json(200, { ...updatedOrder, payment: this.toPaymentSummary(updatedPayment) });
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

  /**
   * specs/0022-cupons-desconto REQ-2/REQ-4/REQ-6 — sem `couponCode` no corpo, devolve
   * `{ discount: 0 }` direto (maioria dos pedidos, sem overhead de I/O extra). Com `couponCode`:
   * revalida (`validateCoupon`, mesma função pura usada por `CouponsController.validate`) e, só
   * se válido, tenta o compare-and-swap do limite de uso (`incrementUsageIfWithinLimit`) **antes**
   * de criar o `Order` — na ordem inversa (criar o pedido primeiro, incrementar depois) uma falha
   * no incremento deixaria um `Order` já criado com desconto aplicado sobre um cupom que estourou
   * o limite; nesta ordem, se o incremento falhar (`null`, limite atingido por uma requisição
   * concorrente que chegou primeiro), nada foi persistido ainda e a resposta é 409 (REQ-4/AC-4,
   * mesmo padrão de `ReceivePurchaseOrderService`, specs/0015). O único cenário não atômico que
   * resta é entre o incremento (sucesso) e a criação do `Order` em si — sem transação
   * multi-documento disponível (MongoDB standalone, mesma decisão de specs/0015): se a criação do
   * pedido falhar depois do incremento, o contador fica um a mais sem um pedido correspondente —
   * risco aceito, raro (sem I/O de rede no meio) e reconciliável manualmente, mesmo racional do
   * ADR de `specs/0015-estoque-compras`.
   */
  private async applyCoupon(
    couponCode: string | undefined,
    restaurantId: string,
    customerId: string,
    orderSubtotal: number,
  ): Promise<{ discount: number; couponCode?: string }> {
    if (!couponCode) return { discount: 0 };

    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await this.couponRepository.findByCode(restaurantId, normalizedCode);
    const customerUsageCount = coupon
      ? await this.orderRepository.countByCustomerAndCoupon(restaurantId, customerId, coupon.code)
      : 0;

    const result = validateCoupon({ coupon, orderSubtotal, now: new Date(), customerUsageCount });
    // `result.valid === false` (não `!result.valid`) — com `tsconfig.json` `strict: false`
    // (`strictNullChecks` desligado), a narrowing de union discriminada por literal booleano só
    // funciona com a comparação explícita, não com negação (`!result.valid` não estreita o tipo
    // e falha o build tentando acessar `.reason` em `ValidateCouponResult`).
    if (result.valid === false) {
      throw new BadRequestError(result.reason);
    }

    // REQ-4 — enforcement atômico do limite total (a checagem acima, contra o dado já lido, não
    // basta sob concorrência).
    const incremented = await this.couponRepository.incrementUsageIfWithinLimit(coupon!.id);
    if (!incremented) {
      throw new ConflictError('Cupom atingiu o limite de uso');
    }

    return { discount: result.discountAmount, couponCode: coupon!.code };
  }

  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — busca o `Product` de cada
  // item só uma vez (mesmo produto pode se repetir entre itens do carrinho), pra resolver
  // `linkedProductId` de cada seleção contra a árvore atual de `additionalGroups`.
  private async resolveItemsLinkedProducts(items: IOrderItem[]): Promise<IOrderItem[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await Promise.all(productIds.map((id) => this.productRepository.findById(id)));
    const productsById = new Map(products.filter((product) => product !== null).map((product) => [product.id, product]));

    return items.map((item) => {
      if (!item.selections || item.selections.length === 0) return item;
      const product = productsById.get(item.productId);
      if (!product) return item;
      return { ...item, selections: resolveOrderItemLinkedProducts(item.selections, product.additionalGroups) };
    });
  }

  private requireStockReservationService(): StockReservationService {
    if (!this.stockReservationService) throw new ConflictError('Controle de estoque indisponível no servidor');
    return this.stockReservationService;
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
      if (restaurant) pixCode = buildOrderPixCode(restaurant, order);
    }

    return { ...order, payment: this.toPaymentSummary(payment), pixCode };
  }

  /** specs/0020-pix-no-app T006 — usado nas listagens (`GET /restaurants/me/orders`): só `payment.status`, sem `pixCode` (fica só no detalhe, REQ-2). */
  /** specs/0156-filtro-idade-impressao-automatica REQ-3 (+ specs/0164: só conta pedido já confirmado, janela desde a confirmação) — calculado na hora de responder, nunca
   * gravado no banco: sempre consistente com `autoPrintMaxAgeMinutes` vigente, mesmo que o
   * restaurante reconfigure esse valor depois (um valor persistido ficaria preso à config antiga). */
  private attachAutoPrintMissed<T extends IOrder>(orders: T[], restaurant: IRestaurant): (T & { autoPrintMissed: boolean })[] {
    const cutoff = Date.now() - (restaurant.autoPrintMaxAgeMinutes ?? 5) * 60_000;
    return orders.map((order) => ({
      ...order,
      autoPrintMissed:
        order.autoPrintStatus !== 'printed' &&
        order.status !== 'cancelado' &&
        (order.orderType === 'delivery' || order.orderType === 'pickup') &&
        this.confirmedAtMs(order) !== undefined &&
        this.confirmedAtMs(order)! < cutoff,
    }));
  }

  /** specs/0164 REQ-3 — instante (ms) da confirmação do pedido, ou `undefined` se ainda não foi confirmado. */
  private confirmedAtMs(order: IOrder): number | undefined {
    const entry = order.statusHistory.find((history) => history.status === 'confirmado');
    return entry ? new Date(entry.changedAt).getTime() : undefined;
  }

  private async attachPaymentSummaries(orders: IOrder[]): Promise<(IOrder & { payment?: Pick<IPayment, 'method' | 'status'> })[]> {
    const payments = await this.paymentRepository.findManyByOrderIds(orders.map((order) => order.id));
    const paymentByOrderId = new Map(payments.map((payment) => [payment.orderId, payment]));

    return orders.map((order) => {
      const payment = paymentByOrderId.get(order.id);
      return payment ? { ...order, payment: this.toPaymentSummary(payment) } : order;
    });
  }

  /** specs/0066 REQ-4 — nome/telefone do cliente pra retaguarda mostrar nos pedidos em andamento
   * (`IOrder` só guarda `customerId`). Poucos pedidos ativos, então `findById` por cliente único. */
  private async attachCustomers<T extends IOrder>(orders: T[]): Promise<(T & { customer?: { name: string; phone?: string } })[]> {
    const customerIds = [...new Set(orders.map((order) => order.customerId))];
    const customers = await Promise.all(customerIds.map((id) => this.customerRepository.findById(id)));
    const customerById = new Map(customerIds.map((id, index) => [id, customers[index]]));

    return orders.map((order) => {
      const customer = customerById.get(order.customerId);
      return customer ? { ...order, customer: { name: customer.name, phone: customer.phone } } : order;
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
      // Pedido explícito do usuário (follow-up) — a página pública de acompanhamento passa a
      // mostrar itens/fotos/observação iguais ao detalhe autenticado; observação do pedido não
      // identifica o cliente, segura de expor aqui (diferente de `deliveryAddress`, que continua
      // omitido de propósito).
      notes: order.notes,
    };
  }
}

/** Taxa de entrega do pedido, decidida no BFF (nunca aceita do app). */
function resolveDeliveryFee(
  restaurant: { deliveryFeeMode: string; deliveryFeeCents: number; deliveryFeeZones: { neighborhood: string; feeCents: number }[] },
  payload: { orderType: string; deliveryNeighborhood?: string },
): number {
  if (payload.orderType !== 'delivery' || restaurant.deliveryFeeMode === 'free') return 0;
  if (restaurant.deliveryFeeMode !== 'byNeighborhood') return restaurant.deliveryFeeCents;
  const zone = findDeliveryFeeZone(restaurant.deliveryFeeZones, payload.deliveryNeighborhood);
  if (!zone) throw new BadRequestError('Não há taxa de entrega cadastrada para este bairro');
  // A zona guarda a taxa em centavos (o web grava R$ x 100); o pedido e o app trabalham em reais.
  return zone.feeCents / 100;
}
