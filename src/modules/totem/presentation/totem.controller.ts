import { randomUUID } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { isBillingBlocked } from '../../billing/domain/billing';
import { BillingBlockedError } from '../../../shared/http/billing-blocked.error';
import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { filterStockGroups, hasStock, toPublicProduct } from '../../catalog/presentation/catalog.controller';
import { buildReceiptLines } from '../../auto-print/domain/build-receipt-lines';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { buildOrderPixCode } from '../../orders/domain/build-order-pix-code';
import { computeOrderPricing } from '../../orders/domain/compute-order-pricing';
import { resolveInitialOrderStatus } from '../../orders/domain/resolve-initial-order-status';
import { resolveOrderItemLinkedProducts } from '../../orders/domain/resolve-order-item-linked-products';
import { findOrderItemPriceMismatches } from '../../orders/domain/validate-order-item-price';
import { isRestaurantOpenNow } from '../../restaurants/domain/is-restaurant-open-now';
import { IOrderItem } from '../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { StockReservationService } from '../../orders/domain/services/stock-reservation.service';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { createTotemOrderSchema } from './totem.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0155-app-totem-autoatendimento — três famílias de rotas, mesmo espírito de
 * `AutoPrintController` (specs/0139):
 * - `/restaurants/me/totem/menu-categories` e `/restaurants/me/totem/orders`: autenticadas pelo
 *   totem físico (`totemApiKeyMiddleware`, header `X-Totem-Api-Key`, REQ-1/REQ-16) — sem
 *   Firebase, sem operador logado.
 * - `/restaurants/me/totem/regenerate-key`: autenticada pelo operador logado (REQ-22),
 *   configuração visível na retaguarda ("Totem").
 *
 * Deliberadamente **não** usa `/restaurants/:id/totem/orders` (literal do `spec.md`) — segue em
 * vez disso o padrão já estabelecido por toda rota autenticada por chave de API deste código
 * (`/restaurants/me/print-queue/...`, `/restaurants/me/orders/:orderId/receipt-lines`):
 * `restaurantId` sempre resolvido pelo middleware a partir da própria chave, nunca aceito como
 * parâmetro de URL — reforça REQ-16 ("autentica só pela chave do totem, escopada ao restaurante
 * dela") sem abrir a possibilidade de um totem mandar um `:id` de outro restaurante.
 */
export class TotemController extends BaseRouter {
  private readonly stockReservationService?: StockReservationService;

  constructor(
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly totemApiKeyMiddleware: AsyncHandler,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    stockMovementRepository: IStockMovementRepository,
    rawMaterialRepository?: IRawMaterialRepository,
  ) {
    super();
    if (rawMaterialRepository) {
      this.stockReservationService = new StockReservationService(productRepository, rawMaterialRepository, stockMovementRepository);
    }
  }

  initializeRoutes(application: Server): void {
    const totemAuthenticated: AsyncHandler[] = [this.totemApiKeyMiddleware];
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // REQ-11/REQ-22 — o totem precisa saber, antes do checkout, quais formas de pagamento o
    // restaurante habilitou especificamente pra ele (configurado na retaguarda,
    // `TotemSettingsPage.tsx`); rota própria e leve, em vez de inchar a resposta de
    // `menu-categories` com dados que não são do cardápio.
    application.get('/restaurants/me/totem/config', ...totemAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant || !restaurant.totemEnabled) throw new NotFoundError('Totem não está habilitado para este restaurante');
      res.json(200, { totemPaymentMethods: restaurant.totemPaymentMethods ?? [] });
    });

    // REQ-7/REQ-17 — diferente de `GET /restaurants/:id/menu-categories` (`CatalogController`),
    // que devolve produtos SEM `additionalGroups` (`IMenuCategoryWithProducts`, resposta leve —
    // o app cliente busca o detalhe completo à parte, `GET /products/:id`): o totem não tem uma
    // segunda chamada por produto (REQ-7 exige abrir a customização direto do toque na grade),
    // então esta rota já junta `productRepository.listByRestaurant` (produtos completos, COM
    // `additionalGroups`) com as categorias — uma única leitura do cardápio inteiro. Reaproveita
    // exatamente as mesmas funções de projeção/filtragem de estoque de `CatalogController`
    // (`hasStock`/`filterStockGroups`/`toPublicProduct`), nunca uma reformatação paralela.
    // `isActive`/`activeDays`/`isAvailable`/janela de horário continuam só guardados e devolvidos
    // (mesma convenção do resto do BFF: "filtro roda client-side") — o totem filtra, mesma regra
    // documentada em `docs/architecture/data-model.md` §Product/§MenuCategory.
    application.get('/restaurants/me/totem/menu-categories', ...totemAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant || !restaurant.totemEnabled) throw new NotFoundError('Totem não está habilitado para este restaurante');

      const stockControlEnabled = restaurant.stockControlEnabled ?? false;
      const [categories, products] = await Promise.all([
        this.menuCategoryRepository.listByRestaurant(req.restaurantId!),
        this.productRepository.listByRestaurant(req.restaurantId!),
      ]);

      const visibleProducts = products.filter((product) => hasStock(product, stockControlEnabled));
      const productsByCategory = new Map<string, typeof visibleProducts>();
      for (const product of visibleProducts) {
        const list = productsByCategory.get(product.menuCategoryId) ?? [];
        list.push(product);
        productsByCategory.set(product.menuCategoryId, list);
      }

      const result = categories.map((category) => ({
        id: category.id,
        name: category.name,
        isActive: category.isActive,
        sortOrder: category.sortOrder,
        activeDays: category.activeDays,
        products: (productsByCategory.get(category.id) ?? []).map((product) =>
          toPublicProduct(
            stockControlEnabled ? { ...product, additionalGroups: filterStockGroups(product.additionalGroups) } : product,
          ),
        ),
      }));

      res.json(200, result);
    });

    // REQ-14/REQ-15/REQ-16/REQ-16a — mesmo motor de regras de `POST /orders`
    // (`OrdersController`): `computeOrderPricing`/`resolveInitialOrderStatus` extraídos pra
    // nunca divergir entre as duas rotas, `isRestaurantOpenNow`/`StockReservationService`/
    // `resolveOrderItemLinkedProducts` reaproveitados direto (mesmas funções/serviço, não uma
    // reimplementação). Sem cupom/cashback (fora de escopo do totem v1 — não há cliente
    // autenticado pra ter saldo/histórico de uso).
    application.post('/restaurants/me/totem/orders', ...totemAuthenticated, async (req: Request, res: Response) => {
      const payload = parseBody(createTotemOrderSchema, req.body);
      const idempotencyKey = payload.idempotencyKey ?? randomUUID();

      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      if (!restaurant.totemEnabled) throw new ForbiddenError('Totem não está habilitado para este restaurante');
      if (isBillingBlocked(restaurant.billing)) throw new BillingBlockedError();
      if (!isRestaurantOpenNow(restaurant)) throw new ConflictError('Restaurante fechado no momento');
      if (!restaurant.orderTypes.includes('pickup')) {
        throw new BadRequestError('Este restaurante não aceita retirada no local');
      }

      // REQ-11 — só as formas habilitadas pro totem especificamente (REQ-22), nunca confia que o
      // totem só mostrou as opções certas na tela (defesa em profundidade, mesmo raciocínio de
      // `acceptedPaymentMethods` em `OrdersController`).
      if (!(restaurant.totemPaymentMethods ?? []).includes(payload.paymentMethod)) {
        throw new BadRequestError('Forma de pagamento não habilitada para o totem');
      }
      // REQ-12 — o totem mostra o **mesmo código** já gerado hoje pro recibo de WhatsApp
      // (`buildOrderPixCode`, chave Pix direta) — sem gateway (Asaas/Mercado Pago) nesta v1, só
      // o BR Code local; por isso a validação aqui é mais estrita que `OrdersController`
      // (que aceita Asaas como alternativa): sem `pixKey` cadastrada, o totem não oferece Pix.
      if (payload.paymentMethod === 'pix' && !restaurant.pixKey) {
        throw new BadRequestError('Restaurante não tem chave Pix cadastrada');
      }

      const existingOrder = payload.idempotencyKey
        ? await this.findByIdempotencyKey(req.restaurantId!, payload.idempotencyKey)
        : null;
      if (existingOrder) {
        res.json(200, existingOrder);
        return;
      }

      const resolvedItems = await this.resolveItemsLinkedProducts(payload.items, restaurant.id);
      const { subtotal, total } = computeOrderPricing({ items: resolvedItems, deliveryFee: 0, discount: 0, cashbackUsed: 0 });
      const initialStatus = resolveInitialOrderStatus(payload.paymentMethod, restaurant);

      // REQ-16a (decisão confirmada) — Customer avulso por pedido, sem conta/login.
      const customer = await this.customerRepository.createStandalone(payload.customerName, payload.customerPhone);

      const orderId = randomUUID();
      const items = restaurant.stockControlEnabled
        ? await this.requireStockReservationService().reserveOrderItems(restaurant.id, resolvedItems, true, orderId, idempotencyKey)
        : resolvedItems;

      let order;
      try {
        order = await this.orderRepository.create({
          id: orderId,
          idempotencyKey,
          customerId: customer.id,
          restaurantId: restaurant.id,
          items,
          orderType: 'pickup',
          source: 'totem',
          notes: payload.notes,
          subtotal,
          deliveryFee: 0,
          discount: 0,
          total,
          paymentMethod: payload.paymentMethod,
          cashChangeFor: payload.cashChangeFor,
          initialStatus,
        });
      } catch (error) {
        const alreadyCreated = await this.findByIdempotencyKey(restaurant.id, idempotencyKey);
        if (alreadyCreated) {
          if (restaurant.stockControlEnabled) {
            await this.requireStockReservationService().releaseReservationsNotAttachedToOrder(restaurant.id, orderId, items, alreadyCreated.items);
          }
          res.json(200, alreadyCreated);
          return;
        }
        if (restaurant.stockControlEnabled) {
          await this.requireStockReservationService().releaseOrderReservations(restaurant.id, orderId, items);
        }
        throw error;
      }

      // REQ-12 — o totem precisa do código Pix já na resposta de criação (pra mostrar o QR code
      // na própria tela, sem outra chamada); `pixCode` nunca é persistido no `Order`, só
      // recalculado aqui, mesmo padrão de `attachPaymentDetails` em `OrdersController`.
      const pixCode = payload.paymentMethod === 'pix' ? buildOrderPixCode(restaurant, order) : undefined;
      res.json(201, { ...order, pixCode });
    });

    // REQ-18 — mesmo formato de linhas de recibo já exposto pro operador em
    // `GET /restaurants/me/orders/:orderId/receipt-lines` (`AutoPrintController`), reaproveitando
    // a mesma função pura `buildReceiptLines` (nunca uma reformatação paralela) — só a
    // autenticação muda (chave do totem, pra ele imprimir localmente assim que cria o pedido,
    // REQ-18/REQ-19) e o escopo (sempre o pedido do próprio restaurante pareado).
    application.get('/restaurants/me/totem/orders/:orderId/receipt-lines', ...totemAuthenticated, async (req: Request, res: Response) => {
      const order = await this.orderRepository.findById(req.params.orderId);
      if (!order || order.restaurantId !== req.restaurantId) {
        throw new NotFoundError('Pedido não encontrado');
      }

      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      const customer = await this.customerRepository.findById(order.customerId);
      res.json(200, { lines: buildReceiptLines(order, restaurant!, customer) });
    });

    // REQ-22 — mesmo padrão de `AutoPrintController.regenerate-key`: regenerar invalida a chave
    // anterior (a antiga simplesmente não casa mais com nenhum restaurante em
    // `findByTotemApiKey`).
    application.post('/restaurants/me/totem/regenerate-key', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.regenerateTotemApiKey(req.restaurantId!);
      res.json(200, { totemApiKey: restaurant.totemApiKey });
    });
  }

  /** Mesmo papel de `OrdersController.findByIdempotencyKey`, mas sem `customerId` (o totem ainda
   * não tem um `Customer` resolvido na primeira tentativa de idempotência — por isso busca só
   * por `restaurantId`+`idempotencyKey`, nunca pelo trio usado no app cliente). */
  private async findByIdempotencyKey(restaurantId: string, idempotencyKey: string) {
    const orders = await this.orderRepository.findActiveByRestaurant(restaurantId);
    return orders.find((order) => order.idempotencyKey === idempotencyKey) ?? null;
  }

  /** Mesmo papel de `OrdersController.resolveItemsLinkedProducts` (REQ-16 de
   * specs/0047-ajustes-diversos-onboarding-estoque-pagamento) — reaproveita a mesma função pura
   * `resolveOrderItemLinkedProducts`, só muda a orquestração de I/O em volta dela.
   *
   * Achado crítico da auditoria pré-produção (31/10/2026) — mesma validação de preço (e mesmo
   * filtro de `restaurantId`, ver comentário gêmeo em `OrdersController`) adicionada aqui também:
   * o totem é outro ponto de criação de pedido que nunca revalidava `unitPrice`. */
  private async resolveItemsLinkedProducts(items: IOrderItem[], restaurantId: string): Promise<IOrderItem[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await Promise.all(productIds.map((id) => this.productRepository.findById(id)));
    const productsById = new Map(
      products.filter((product) => product !== null && product.restaurantId === restaurantId).map((product) => [product.id, product]),
    );

    const mismatches = findOrderItemPriceMismatches(items, productsById);
    if (mismatches.length > 0) {
      const description = mismatches.map((mismatch) => `${mismatch.productName} (enviado R$ ${mismatch.sentUnitPrice})`).join(', ');
      throw new BadRequestError(`Preço divergente do catálogo atual: ${description}`);
    }

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
}
