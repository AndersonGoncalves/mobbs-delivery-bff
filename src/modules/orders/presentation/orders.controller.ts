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
import { environment } from '../../../shared/config/environment';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrder, IOrderItem, IPayment } from '../domain/entities/order.entity';
import { AsaasClient } from '../../payments-asaas/infra/asaas-client';
import { MercadoPagoClient } from '../../payments-mercadopago/infra/mercado-pago-client';
import { IFoodAuthService } from '../../ifood-integration/infra/ifood-auth.service';
import { IFoodClient } from '../../ifood-integration/infra/ifood-client';
import { FiscalEmissionService } from '../../fiscal-integration/domain/services/fiscal-emission.service';
import { ConfirmOnlinePaymentService } from '../domain/services/confirm-online-payment.service';
import { StockReservationService } from '../domain/services/stock-reservation.service';
import { isOrderCancellableByOperator, isValidOrderStatusTransition } from '../domain/order-status-transitions';
import { buildOrderPixCode } from '../domain/build-order-pix-code';
import { computeOrderPricing } from '../domain/compute-order-pricing';
import { resolveInitialOrderStatus } from '../domain/resolve-initial-order-status';
import { resolveOrderItemLinkedProducts } from '../domain/resolve-order-item-linked-products';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IRestaurantTableRepository } from '../../table-service/domain/repositories/table.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { CustomerBalanceService } from '../../customer-balance/domain/services/customer-balance.service';
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
  // specs/0090-integracao-ifood — instâncias únicas (não por chamada): `ifoodAuthService`
  // aproveita o cache de token em memória entre requisições (mesmo raciocínio de
  // `WhatsAppConnectionService` guardar estado em memória); `ifoodClient` recebe o token por
  // chamada (mesmo padrão de `FacebookGraphClient`), por isso pode ser uma instância só.
  private readonly ifoodAuthService = new IFoodAuthService(environment.ifood.baseUrl);
  private readonly ifoodClient = new IFoodClient(environment.ifood.baseUrl);

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
    // specs/0131-cashback-app + specs/0132-programa-fidelidade-app — saldo resgatável
    // compartilhado (resgate na criação, devolução no cancelamento, crédito na entrega).
    private readonly customerBalanceService?: CustomerBalanceService,
    // specs/0091-integracao-fiscal-focusnfe REQ-2 — emissão fiscal automática no mesmo gatilho
    // ("entregue") do recálculo de faturamento/caixa acima; `undefined` = integração fiscal
    // desligada neste BFF (nunca deveria acontecer em produção, só defesa de teste/composição).
    private readonly fiscalEmissionService?: FiscalEmissionService,
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
      // specs/0101-integracao-asaas (fase 1) — com Asaas habilitado, a chave direta deixa de ser
      // obrigatória: a cobrança passa a ser pelo gateway, não por um Pix combinado manualmente.
      if (payload.paymentMethod === 'pix' && !restaurant.pixKey && !(restaurant.onlinePaymentsEnabled && restaurant.asaasApiKey)) {
        throw new BadRequestError('Restaurante não tem chave Pix cadastrada');
      }

      // specs/0170-integracao-mercado-pago REQ-3 — mesmo raciocínio do Pix acima: o app já
      // esconde a opção sem vínculo, isto é defesa em profundidade.
      // specs/0101-integracao-asaas (fase 2) — Asaas Checkout é um gateway alternativo válido pro
      // mesmo `creditCardOnline`; só rejeita se o restaurante não tem NENHUM dos dois vinculado.
      if (
        payload.paymentMethod === 'creditCardOnline' &&
        !restaurant.mercadoPagoAccessToken &&
        !(restaurant.onlinePaymentsEnabled && restaurant.asaasApiKey)
      ) {
        throw new BadRequestError('Restaurante não tem gateway de cartão online vinculado');
      }

      // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — 'free' nunca cobra,
      // independente do que estiver em `deliveryFeeCents` (o restaurante pode ter mudado de modo
      // sem zerar o valor antigo). Por bairro, a taxa é a da zona do bairro escolhido — mesma regra que
      // o app mostra no checkout (`GET /restaurants/:id/delivery-fee`) — e sem zona o pedido não fecha.
      const deliveryFee = resolveDeliveryFee(restaurant, payload);

      // specs/0155-app-totem-autoatendimento (plan.md, ADR) — subtotal calculado via
      // `computeOrderPricing` (extraído pra ser reaproveitado pelo `TotemController`, mesma
      // fórmula, nunca uma reimplementação paralela). `cashbackUsed` só entra no total depois de
      // resolvido abaixo, por isso o cálculo aqui é em duas etapas (mesmo comportamento de antes).
      const subtotal = computeOrderPricing({ items: payload.items, deliveryFee: 0, discount: 0, cashbackUsed: 0 }).subtotal;

      // specs/0022-cupons-desconto REQ-2/REQ-4 — primeiro consumidor real de `Order.discount`
      // (antes hardcoded em `0`). **Nunca confia no desconto calculado pelo app**: revalida tudo
      // de novo aqui, mesmo que o cliente já tenha "aplicado" o cupom antes via
      // `POST /restaurants/:id/coupons/validate` (feedback de UX, não fonte de verdade).
      const { discount, couponCode } = await this.applyCoupon(payload.couponCode, payload.restaurantId, req.user!.uid, subtotal);
      const orderTotalBeforeCashback = subtotal + deliveryFee - discount;

      // Resolve os vínculos atuais e reserva saldo antes de aceitar o pedido. O corpo enviado pelo
      // cliente nunca fornece ids de estoque; só nomes de grupo/opção são casados com o catálogo.
      const resolvedItems = await this.resolveItemsLinkedProducts(payload.items);
      const orderId = randomUUID();

      // specs/0131-cashback-app REQ-4/REQ-5/REQ-7 — nunca confia no valor pedido pelo app: capa
      // em min(saldo real, valor pedido, total do pedido antes do cashback) e debita atomicamente.
      const cashbackUsed =
        payload.cashbackAmount && this.customerBalanceService
          ? await this.customerBalanceService.debitRedemption(req.user!.uid, payload.restaurantId, payload.cashbackAmount, orderTotalBeforeCashback, orderId)
          : 0;
      const total = orderTotalBeforeCashback - cashbackUsed;

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
      // specs/0170-integracao-mercado-pago — `creditCardOnline` tem a mesma restrição do Pix,
      // mesmo motivo: também só confirma depois do pagamento aprovado (webhook).
      // specs/0155-app-totem-autoatendimento (plan.md, ADR) — regra extraída pra
      // `resolveInitialOrderStatus`, reaproveitada pelo `TotemController`.
      const initialStatus = resolveInitialOrderStatus(payload.paymentMethod, restaurant);

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
        cashbackUsed,
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

      // specs/0101-integracao-asaas (fase 1) — pedido/pagamento já criados (acima); cobra o Pix
      // de verdade no Asaas antes de responder (o cliente precisa do código pra pagar na mesma
      // tela de revisão, não dá pra ser fire-and-forget como o WhatsApp abaixo). Qualquer falha
      // (sem CPF, rede, API do Asaas fora) cai no fallback do Pix local (`buildOrderPixCode`,
      // `attachPaymentDetails`) sem derrubar a criação do pedido, que já aconteceu.
      if (payload.paymentMethod === 'pix' && restaurant.onlinePaymentsEnabled && restaurant.asaasApiKey) {
        await this.tryChargeOrderPixViaAsaas(order, restaurant);
      }

      // specs/0170-integracao-mercado-pago (REQ-2) — mesmo raciocínio de `tryChargeOrderPixViaAsaas`
      // acima, mas SEM fallback local: se a criação da preferência falhar, `checkoutUrl` simplesmente
      // não é preenchido (o pedido já foi criado, e `attachPaymentDetails`/o app precisam lidar com a
      // ausência — diferente do Pix, aqui não existe um "cartão local" equivalente ao BR Code pra cair).
      if (payload.paymentMethod === 'creditCardOnline' && restaurant.mercadoPagoAccessToken) {
        await this.tryCreateMercadoPagoPreference(order, restaurant);
      } else if (payload.paymentMethod === 'creditCardOnline' && restaurant.onlinePaymentsEnabled && restaurant.asaasApiKey) {
        // specs/0101-integracao-asaas (fase 2) — Mercado Pago tem prioridade quando o restaurante
        // tem os dois configurados (evita ambiguidade de qual gateway processou o pagamento, pro
        // estorno saber pra quem ligar depois); Asaas é o fallback quando só ele está habilitado.
        await this.tryCreateAsaasCheckout(order, restaurant);
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
      // specs/0101-integracao-asaas (fase 1) — mesma preferência de `attachPaymentDetails`.
      const payment = await this.paymentRepository.findByOrderId(order.id);

      const text = buildNewOrderRestaurantMessage({
        template: restaurant.newOrderRestaurantWhatsAppTemplate ?? DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE,
        order,
        customerName: customer?.name ?? 'Cliente',
        customerPhone: customer?.phone,
        restaurantSlug: restaurant.slug,
        pixCode: payment?.pixPayload ?? buildOrderPixCode(restaurant, order),
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
      await this.tryRefundOrderPixViaAsaas(order);
      await this.tryRefundOrderCardOnlineViaMercadoPago(order);
      await this.tryRefundOrderCardOnlineViaAsaas(order);
      await this.refundCashbackIfUsed(order);

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

    // specs/0187-kds-cozinha REQ-6/REQ-9/REQ-10/REQ-20 — leitura dedicada e redigida pro KDS,
    // separada de `GET /restaurants/me/orders` (que devolve o `IOrder` cru completo, incluindo
    // total/pagamento/endereço/contato — exatamente o que REQ-20 proíbe pro papel `cozinha`;
    // `plan.md` ADR). Mesmas 4 roles que podem logar no KDS (REQ-6); `dono`/`gerente`/
    // `financeiro` continuam podendo usar a lista completa de `GET /restaurants/me/orders`
    // normalmente — esta rota nova não substitui aquela, só soma.
    const kitchenAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro', 'cozinha'),
    ];

    // REQ-8 — praças (`Product.kitchenStation`) distintas em uso pelo restaurante, pra alimentar
    // o seletor de praça do KDS no primeiro login. Calculado a partir do catálogo completo (não
    // só dos pedidos ativos agora — uma cozinha momentaneamente vazia ainda precisa saber quais
    // praças existem, `plan.md` "Riscos"), mas devolve só os nomes: nunca o produto/preço/
    // cardápio inteiro (REQ-7 — `cozinha` não acessa cardápio).
    application.get('/restaurants/me/kitchen/stations', ...kitchenAuthenticated, async (req: Request, res: Response) => {
      const products = await this.productRepository.listByRestaurant(req.restaurantId!);
      const stations = [...new Set(products.map((product) => product.kitchenStation).filter((station): station is string => !!station?.trim()))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      );
      res.json(200, { stations });
    });

    // REQ-9/REQ-10/REQ-20 — pedidos `confirmado`/`emPreparo` do restaurante do operador logado,
    // mais antigo primeiro por `confirmedAt` (momento em que entrou na fila de preparo, não
    // `createdAt` bruto — decisão de design 5, `specs/0187-kds-cozinha/spec.md`), numa vista
    // redigida (`toKitchenView`, sem total/subtotal/forma de pagamento/endereço/contato do
    // cliente). `kitchenStation` por item é resolvido ao vivo contra o catálogo atual (`plan.md`
    // ADR), reaproveitando `findActiveByRestaurant` já existente (specs/0008) — sem método de
    // repositório novo, só filtra/ordena em memória (poucos pedidos ativos por restaurante).
    application.get('/restaurants/me/kitchen/orders', ...kitchenAuthenticated, async (req: Request, res: Response) => {
      const [orders, products] = await Promise.all([
        this.orderRepository.findActiveByRestaurant(req.restaurantId!),
        this.productRepository.listByRestaurant(req.restaurantId!),
      ]);
      const stationByProductId = new Map(products.map((product) => [product.id, product.kitchenStation]));
      const kitchenOrders = orders
        .filter((order) => order.status === 'confirmado' || order.status === 'emPreparo')
        .map((order) => this.toKitchenView(order, stationByProductId))
        .sort((a, b) => new Date(a.confirmedAt ?? 0).getTime() - new Date(b.confirmedAt ?? 0).getTime());
      res.json(200, kitchenOrders);
    });

    // specs/0137-papeis-garcom-motoboy REQ-3 — além de `dono`/`gerente`, `motoboy` também pode
    // chamar esta rota, mas só pra marcar a própria entrega como `entregue` (checagem de posse
    // abaixo); `dono`/`gerente` continuam sem nenhuma restrição extra, como hoje.
    // specs/0187-kds-cozinha REQ-15/REQ-17 — `cozinha` também pode chamar esta mesma rota (botão
    // "Pronto" do KDS dispara exatamente este PATCH, nunca uma rota nova), mas só enquanto o
    // pedido estiver `confirmado`/`emPreparo` (checagem de posse abaixo, mesmo molde da de
    // `motoboy`) — a trava de "qual é o próximo status válido" continua 100% em
    // `isValidOrderStatusTransition`, inalterada.
    const statusUpdateAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro', 'motoboy', 'cozinha'),
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

        // specs/0187-kds-cozinha REQ-7/REQ-17 — `cozinha` só avança um pedido que esteja
        // atualmente `confirmado`/`emPreparo` (a janela que o KDS mostra, REQ-9); fora dela —
        // `entregue`, `cancelado`, `saiuParaEntrega`, `aguardandoConfirmacao` — é 403, mesmo que
        // a transição numérica fizesse sentido pra outro papel (mantém REQ-7: "sem acesso a
        // nenhuma outra área").
        if (req.operatorRole === 'cozinha' && order.status !== 'confirmado' && order.status !== 'emPreparo') {
          throw new ForbiddenError('Papel cozinha só pode avançar pedidos confirmados ou em preparo');
        }

        if (!isValidOrderStatusTransition(order.status, status)) {
          throw new BadRequestError(`Não é possível mudar de "${order.status}" para "${status}"`);
        }

        const updated = await this.orderRepository.updateStatus(order.id, status, req.restaurantId);

        // specs/0090-integracao-ifood REQ-5 — confirmar na retaguarda um pedido de origem iFood
        // também confirma na API deles.
        if (status === 'confirmado') {
          await this.tryConfirmOrderViaIFood(updated);
        }

        // specs/0013-notificacoes-whatsapp REQ-2/REQ-4 — mesma lógica fire-and-forget do REQ-1.
        void this.whatsAppNotificationService.sendOrderStatusUpdate(updated).catch((error) => {
          console.error(`[whatsapp] erro inesperado enviando atualização de status do pedido ${updated.id}:`, error);
        });

        // specs/0014-financeiro REQ-5 — delivery e retirada lançam o movimento ao chegar em
        // "entregue" (não há status separado pros dois). Pedido de mesa lança um movimento por
        // pagamento, no `TableOrderService`, e não de novo aqui. Sem sessão aberta o serviço
        // não grava nada. Protegido por try/catch: falha na contabilização não reverte o status.
        if (status === 'entregue' && this.recomputeRestaurantBilling) {
          void this.recomputeRestaurantBilling.call(updated.restaurantId).catch((error) => {
            console.error(`[billing] falha ao recalcular faturamento do restaurante ${updated.restaurantId}:`, error);
          });
        }
        if (status === 'entregue' && updated.orderType !== 'table') {
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
        // specs/0131-cashback-app REQ-2 / specs/0132-programa-fidelidade-app REQ-2/REQ-3 — mesmo
        // corte de `orderType !== 'table'` e mesmo try/catch não-bloqueante do caixa automático
        // acima: falha ao creditar nunca reverte o status, que já avançou.
        if (status === 'entregue' && updated.orderType !== 'table' && this.customerBalanceService) {
          try {
            const restaurant = await this.restaurantRepository.findById(updated.restaurantId);
            if (restaurant?.cashbackPercent) {
              // `updated.total` já é líquido do cashback resgatado no mesmo pedido (`total =
              // subtotal + deliveryFee - discount - cashbackUsed`) — "sem contar o cashback já
              // resgatado nesse mesmo pedido" (REQ-2) cai de graça da própria definição de `total`.
              const cashbackAmount = Math.round((restaurant.cashbackPercent / 100) * updated.total * 100) / 100;
              if (cashbackAmount > 0) {
                await this.customerBalanceService.creditCashback(updated.customerId, updated.restaurantId, cashbackAmount, updated.id);
              }
            }
            // specs/0192-ajustes-banner-fidelidade-pix-asaas REQ-5/REQ-6 — mesma base de
            // `updated.total` usada acima pro cashback percentual (já líquida do cashback
            // resgatado no mesmo pedido); pedido abaixo do mínimo configurado não gera carimbo
            // nenhum (nem avança nem retrocede o contador atual). Sem mínimo configurado
            // (ausente/0), `?? 0` preserva o comportamento de antes desta spec: todo pedido conta.
            const meetsLoyaltyMinOrderValue = updated.total >= (restaurant?.loyaltyMinOrderValue ?? 0);
            if (restaurant?.loyaltyGoalOrders && meetsLoyaltyMinOrderValue) {
              const stampCount = await this.customerBalanceService.incrementLoyaltyStamp(updated.customerId, updated.restaurantId);
              if (stampCount >= restaurant.loyaltyGoalOrders) {
                await this.customerBalanceService.creditLoyaltyReward(
                  updated.customerId,
                  updated.restaurantId,
                  restaurant.loyaltyRewardValue ?? 0,
                  updated.id,
                );
                await this.customerBalanceService.resetLoyaltyStamp(updated.customerId, updated.restaurantId);
              }
            }
          } catch (error) {
            console.error(`[customer-balance] erro inesperado creditando cashback/fidelidade do pedido ${updated.id}:`, error);
          }
        }

        // specs/0091-integracao-fiscal-focusnfe REQ-2 — emissão fiscal automática, em paralelo,
        // nunca bloqueando a resposta (o próprio serviço nunca lança — ver `FiscalEmissionService`
        // — este catch é só defesa extra, mesmo padrão fire-and-forget do WhatsApp acima).
        if (status === 'entregue' && this.fiscalEmissionService) {
          void this.fiscalEmissionService.emitForOrder(updated).catch((error) => {
            console.error(`[fiscal-integration] erro inesperado emitindo documento fiscal do pedido ${updated.id}:`, error);
          });
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
    // (`isOrderCancellableByOperator`, specs/0006 REQ-6 é mais restrito).
    application.patch(
      '/restaurants/me/orders/:id/cancel',
      ...operatorAuthenticated,
      async (req: Request, res: Response) => {
        const { reason } = parseBody(cancelOrderWithReasonSchema, req.body);
        const order = await this.findOwnedOrderForRestaurant(req.params.id, req.restaurantId!);

        if (!isOrderCancellableByOperator(order.status)) {
          throw new BadRequestError('Pedido não pode mais ser cancelado');
        }

        const updated = await this.orderRepository.updateStatus(order.id, 'cancelado', req.restaurantId, reason);
        if (order.items.some((item) => (item.stockReservations?.length ?? 0) > 0)) {
          await this.requireStockReservationService().releaseOrderReservations(order.restaurantId, order.id, order.items);
        }
        if (order.orderType === 'table' && order.tableId) {
          await this.tableRepository?.releaseFromOrder(order.tableId, req.restaurantId!, order.id);
        }
        await this.tryRefundOrderPixViaAsaas(order);
        await this.tryRefundOrderCardOnlineViaMercadoPago(order);
        await this.tryRefundOrderCardOnlineViaAsaas(order);
        await this.refundCashbackIfUsed(order);
        // specs/0090-integracao-ifood REQ-6 — cancelar na retaguarda um pedido de origem iFood
        // também solicita o cancelamento na API deles.
        await this.tryCancelOrderViaIFood(updated, reason);

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

        // specs/0140-confirmacao-automatica-pix REQ-1/REQ-1a — mesma lógica de confirmação
        // (marcar aprovado + avançar status + notificar) usada pelo webhook gateway-agnóstico
        // (REQ-1b, `PaymentWebhookController`), extraída pra `ConfirmOnlinePaymentService` pra
        // garantir o mesmo comportamento nas duas origens. Achado real (pedido explícito do
        // usuário) — `manual: true` porque este é um clique humano do operador ("Pix recebido"):
        // sempre avança o pedido, independente de `autoConfirmPaymentMethods` (essa config só
        // controla o caminho automático — webhook sem ninguém olhando).
        const { order: updatedOrder, payment: updatedPayment } = await new ConfirmOnlinePaymentService(
          this.paymentRepository,
          this.orderRepository,
          this.restaurantRepository,
          this.whatsAppNotificationService,
        ).confirm(order, { manual: true });

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
      // specs/0175-cobranca-assinatura-asaas REQ-25 — "acompanhamento de pedidos existentes" por
      // link direto, mesmo sentinela já usado por `GET /restaurants/resolve/:slug`: nunca expõe
      // dado do pedido pra visitante de restaurante bloqueado (REQ-30).
      const restaurant = await this.restaurantRepository.findById(found.restaurantId);
      if (restaurant && isBillingBlocked(restaurant.billing)) {
        res.json(200, { blocked: true });
        return;
      }
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

  /**
   * specs/0131-cashback-app REQ-6 — devolve ao saldo o valor de cashback resgatado num pedido
   * cancelado antes de entregar (único momento em que cancelar é possível —
   * `order-status-transitions.ts`, `entregue` é terminal). Fire-and-forget/try-catch: falha na
   * devolução nunca reverte o cancelamento, que já aconteceu.
   */
  private async refundCashbackIfUsed(order: IOrder): Promise<void> {
    if (!order.cashbackUsed || !this.customerBalanceService) return;
    try {
      await this.customerBalanceService.refundRedemption(order.customerId, order.restaurantId, order.cashbackUsed, order.id);
    } catch (error) {
      console.error(`[customer-balance] erro inesperado devolvendo cashback do pedido ${order.id}:`, error);
    }
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
  private async attachPaymentDetails(order: IOrder): Promise<IOrder & { payment?: Pick<IPayment, 'method' | 'status'>; pixCode?: string; checkoutUrl?: string }> {
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) return order;

    let pixCode: string | undefined;
    if (order.paymentMethod === 'pix' && payment.status === 'pendente') {
      // specs/0101-integracao-asaas (fase 1) — `pixPayload` (persistido na criação do pedido,
      // `tryChargeOrderPixViaAsaas`) tem prioridade sobre o BR Code local: só existe quando a
      // cobrança real no Asaas deu certo, e um recalculado (`buildOrderPixCode`) não teria
      // relação com ela.
      if (payment.pixPayload) {
        pixCode = payment.pixPayload;
      } else {
        const restaurant = await this.restaurantRepository.findById(order.restaurantId);
        if (restaurant) pixCode = buildOrderPixCode(restaurant, order);
      }
    }

    // specs/0170-integracao-mercado-pago (REQ-2) — some da resposta depois de aprovado, mesmo
    // raciocínio do `pixCode` acima (evita reabrir a WebView de um pagamento já concluído).
    const checkoutUrl = order.paymentMethod === 'creditCardOnline' && payment.status === 'pendente' ? payment.checkoutUrl : undefined;

    return { ...order, payment: this.toPaymentSummary(payment), pixCode, checkoutUrl };
  }

  /** specs/0101-integracao-asaas (fase 1) — tenta cobrar o Pix de verdade no Asaas (cliente
   * Asaas + cobrança + QR), persistindo o resultado no `Payment` já criado. Qualquer falha
   * (sem CPF do cliente, rede, erro da API do Asaas) é logada e engolida — nunca propaga: o
   * pedido já foi criado, e `attachPaymentDetails` cai sozinho no Pix local
   * (`buildOrderPixCode`) quando `pixPayload` não existe. */
  private async tryChargeOrderPixViaAsaas(order: IOrder, restaurant: IRestaurant): Promise<void> {
    try {
      const customer = await this.customerRepository.findById(order.customerId);
      if (!customer?.document) {
        console.warn(`[asaas] pedido ${order.id}: cliente sem CPF/CNPJ cadastrado, caindo no Pix local`);
        return;
      }

      const client = new AsaasClient(restaurant.asaasApiKey!, environment.asaas.baseUrl);
      const asaasCustomer = await client.createCustomer(customer.name, customer.document.replace(/\D/g, ''));
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const charge = await client.createPixCharge(asaasCustomer.id, order.total, dueDate, order.id);
      const qrCode = await client.getPixQrCode(charge.id);

      await this.paymentRepository.setAsaasPixDetails(order.id, { externalReference: charge.id, pixPayload: qrCode.payload });
    } catch (error) {
      console.error(`[asaas] erro inesperado cobrando o Pix do pedido ${order.id} — caindo no Pix local:`, error);
    }
  }

  /** specs/0101-integracao-asaas (fase 1, REQ-6) — estorna no Asaas um pedido cancelado cujo Pix
   * já tinha sido aprovado por lá. Fire-and-forget com log (mesmo padrão dos disparos de
   * WhatsApp): uma falha no estorno nunca desfaz o cancelamento em si, que já aconteceu — fica
   * pro operador resolver manualmente no painel do Asaas se isso acontecer. */
  private async tryRefundOrderPixViaAsaas(order: IOrder): Promise<void> {
    if (order.paymentMethod !== 'pix') return;
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment || payment.status !== 'aprovado' || !payment.externalReference) return;

    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    if (!restaurant?.asaasApiKey) return;

    try {
      const client = new AsaasClient(restaurant.asaasApiKey, environment.asaas.baseUrl);
      await client.refundCharge(payment.externalReference);
      await this.paymentRepository.markAsRefunded(order.id);
    } catch (error) {
      console.error(`[asaas] erro inesperado estornando o Pix do pedido ${order.id} — cancelamento já efetivado, resolver manualmente:`, error);
    }
  }

  /** specs/0090-integracao-ifood REQ-5 — confirmação do operador na retaguarda propagada pro
   * iFood; nunca bloqueia a confirmação local (mesmo raciocínio de `tryRefundOrderPixViaAsaas`:
   * falha aqui é logada e engolida, o pedido já confirmou do nosso lado). */
  private async tryConfirmOrderViaIFood(order: IOrder): Promise<void> {
    if (order.source !== 'ifood') return;
    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    if (!restaurant?.ifoodClientId || !restaurant.ifoodClientSecret) return;

    try {
      const accessToken = await this.ifoodAuthService.getAccessToken(restaurant.ifoodClientId, restaurant.ifoodClientSecret);
      await this.ifoodClient.confirmOrder(accessToken, order.id);
    } catch (error) {
      console.error(`[ifood-integration] erro inesperado confirmando o pedido ${order.id} no iFood:`, error);
    }
  }

  /** specs/0090-integracao-ifood REQ-6 — mesmo raciocínio de `tryConfirmOrderViaIFood` acima,
   * pro cancelamento (com motivo). */
  private async tryCancelOrderViaIFood(order: IOrder, reason: string): Promise<void> {
    if (order.source !== 'ifood') return;
    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    if (!restaurant?.ifoodClientId || !restaurant.ifoodClientSecret) return;

    try {
      const accessToken = await this.ifoodAuthService.getAccessToken(restaurant.ifoodClientId, restaurant.ifoodClientSecret);
      await this.ifoodClient.requestCancellation(accessToken, order.id, reason);
    } catch (error) {
      console.error(`[ifood-integration] erro inesperado cancelando o pedido ${order.id} no iFood:`, error);
    }
  }

  /** specs/0170-integracao-mercado-pago (REQ-2) — cria a preferência de Checkout Pro em nome do
   * restaurante (`accessToken` DELE, não nosso) e persiste `checkoutUrl`/`externalReference` no
   * `Payment` já criado. Qualquer falha (token expirado, rede, API do Mercado Pago fora) é
   * logada e engolida — nunca propaga: o pedido já foi criado, e SEM fallback local (diferente
   * do Pix) — `checkoutUrl` simplesmente fica ausente, cabendo ao app reportar ao cliente. */
  private async tryCreateMercadoPagoPreference(order: IOrder, restaurant: IRestaurant): Promise<void> {
    try {
      const client = new MercadoPagoClient(environment.mercadoPago.clientId ?? '', environment.mercadoPago.clientSecret ?? '', environment.mercadoPago.baseUrl);
      const trackingUrl = `${environment.publicApp.baseUrl}/${restaurant.slug}/pedidos/${order.id}`;
      const preference = await client.createPreference(restaurant.mercadoPagoAccessToken!, {
        orderId: order.id,
        items: order.items.map((item) => ({ title: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
        notificationUrl: `${environment.server.publicBaseUrl}/webhooks/mercadopago`,
        backUrls: { success: trackingUrl, failure: trackingUrl, pending: trackingUrl },
      });

      await this.paymentRepository.setMercadoPagoCheckoutDetails(order.id, { externalReference: preference.id, checkoutUrl: preference.initPoint });
    } catch (error) {
      console.error(`[mercadopago] erro inesperado criando a preferência de checkout do pedido ${order.id}:`, error);
    }
  }

  /** specs/0101-integracao-asaas (fase 2) — cria o checkout hospedado (cartão digitado numa
   * página do Asaas, nunca no nosso backend) e persiste `checkoutUrl`/`externalReference`
   * (id do CHECKOUT, só até o webhook confirmar e trocar pelo id do pagamento real — ver
   * `AsaasWebhookController`). Mesmo padrão de `tryCreateMercadoPagoPreference`: qualquer falha é
   * logada e engolida, sem fallback local (não existe "checkout local" equivalente ao BR Code). */
  private async tryCreateAsaasCheckout(order: IOrder, restaurant: IRestaurant): Promise<void> {
    try {
      const client = new AsaasClient(restaurant.asaasApiKey!, environment.asaas.baseUrl);

      // Webhook de checkout é registrado sob demanda, uma vez por restaurante — nunca mexe no
      // webhook de Pix já criado em `createSubaccount` (fase 1), que continua intocado.
      if (!restaurant.asaasCheckoutWebhookRegistered) {
        const webhookUrl = `${environment.server.publicBaseUrl}/webhooks/asaas/${restaurant.id}`;
        await client.createCheckoutWebhook(webhookUrl, restaurant.asaasWebhookToken!, restaurant.asaasSubaccountData?.email ?? 'contato@bsdelivery.com.br');
        await this.restaurantRepository.markAsaasCheckoutWebhookRegistered(restaurant.id);
      }

      const trackingUrl = `${environment.publicApp.baseUrl}/${restaurant.slug}/pedidos/${order.id}`;
      const checkout = await client.createCheckout({
        items: order.items.map((item) => ({ name: item.productName, quantity: item.quantity, value: item.unitPrice })),
        externalReference: order.id,
        successUrl: trackingUrl,
        cancelUrl: trackingUrl,
        expiredUrl: trackingUrl,
      });

      await this.paymentRepository.setAsaasCheckoutDetails(order.id, { externalReference: checkout.id, checkoutUrl: checkout.link });
    } catch (error) {
      console.error(`[asaas] erro inesperado criando o checkout de cartão do pedido ${order.id}:`, error);
    }
  }

  /** specs/0101-integracao-asaas (fase 2) — estorna no Asaas um pedido cancelado cujo cartão
   * online (via checkout hospedado) já tinha sido aprovado por lá. `payment.externalReference`
   * já foi trocado do id do checkout pro id do pagamento real pelo webhook no momento da
   * confirmação (`AsaasWebhookController`) — se isso nunca aconteceu (pagamento nunca confirmado
   * por aqui), não há o que estornar. */
  private async tryRefundOrderCardOnlineViaAsaas(order: IOrder): Promise<void> {
    if (order.paymentMethod !== 'creditCardOnline') return;
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment || payment.status !== 'aprovado' || !payment.externalReference) return;

    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    // Mercado Pago tem prioridade quando os dois estão configurados (mesmo critério da criação).
    if (!restaurant?.asaasApiKey || restaurant.mercadoPagoAccessToken) return;

    try {
      const client = new AsaasClient(restaurant.asaasApiKey, environment.asaas.baseUrl);
      await client.refundCharge(payment.externalReference);
      await this.paymentRepository.markAsRefunded(order.id);
    } catch (error) {
      console.error(`[asaas] erro inesperado estornando o cartão online do pedido ${order.id} — cancelamento já efetivado, resolver manualmente:`, error);
    }
  }

  /** specs/0170-integracao-mercado-pago (REQ-7) — estorna no Mercado Pago um pedido cancelado
   * cujo cartão online já tinha sido aprovado por lá. Mesmo padrão de `tryRefundOrderPixViaAsaas`. */
  private async tryRefundOrderCardOnlineViaMercadoPago(order: IOrder): Promise<void> {
    if (order.paymentMethod !== 'creditCardOnline') return;
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment || payment.status !== 'aprovado' || !payment.externalReference) return;

    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    if (!restaurant?.mercadoPagoAccessToken) return;

    try {
      const client = new MercadoPagoClient(environment.mercadoPago.clientId ?? '', environment.mercadoPago.clientSecret ?? '', environment.mercadoPago.baseUrl);
      await client.refundPayment(restaurant.mercadoPagoAccessToken, payment.externalReference);
      await this.paymentRepository.markAsRefunded(order.id);
    } catch (error) {
      console.error(`[mercadopago] erro inesperado estornando o cartão online do pedido ${order.id} — cancelamento já efetivado, resolver manualmente:`, error);
    }
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

  /**
   * specs/0187-kds-cozinha REQ-9/REQ-10/REQ-11/REQ-20 — vista do pedido pra `GET
   * /restaurants/me/kitchen/orders`: deliberadamente SEM `total`/`subtotal`/`deliveryFee`/
   * `discount`/`paymentMethod`/`payment`/`deliveryAddress`/`customer` (REQ-20 — nada fora do
   * necessário pro preparo). `kitchenStation` de cada item é resolvido ao vivo contra o `Product`
   * atual (`stationByProductId`, `plan.md` ADR) — produto sem `kitchenStation`/removido do
   * catálogo cai em `undefined` (REQ-1 da decisão de design: "praça Geral"/sem filtro).
   */
  private toKitchenView(order: IOrder, stationByProductId: Map<string, string | undefined>) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      statusHistory: order.statusHistory,
      confirmedAt: order.statusHistory.find((history) => history.status === 'confirmado')?.changedAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        notes: item.notes,
        kitchenStation: stationByProductId.get(item.productId),
        selections: (item.selections ?? []).map((selection) => ({ groupName: selection.groupName, optionName: selection.optionName })),
      })),
    };
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
    const motoboyIds = [...new Set(orders.flatMap((order) => order.deliveryMotoboy ? [order.deliveryMotoboy.id] : []))];
    const motoboys = await Promise.all(motoboyIds.map((id) => this.restaurantOperatorRepository.findById(id)));
    const motoboyById = new Map(motoboyIds.map((id, index) => [id, motoboys[index]]));

    return orders.map((order) => {
      const customer = customerById.get(order.customerId);
      const motoboy = order.deliveryMotoboy && motoboyById.get(order.deliveryMotoboy.id);
      return {
        ...order,
        ...(customer ? { customer: { name: customer.name, phone: customer.phone } } : {}),
        ...(motoboy?.restaurantId === order.restaurantId && motoboy.whatsapp
          ? { deliveryMotoboy: { ...order.deliveryMotoboy, whatsapp: motoboy.whatsapp } }
          : {}),
      };
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

/**
 * Taxa de entrega do pedido, decidida no BFF (nunca aceita do app).
 * `export` — specs/0174-pdv-extensao-chrome-lateral reaproveita esta mesma função pro checkout de
 * operador (delivery/retirada/balcão pela extensão/PDV web), nunca uma reimplementação paralela
 * do cálculo de taxa (mesmo cuidado já aplicado a `computeOrderPricing`/`resolveInitialOrderStatus`).
 */
export function resolveDeliveryFee(
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
