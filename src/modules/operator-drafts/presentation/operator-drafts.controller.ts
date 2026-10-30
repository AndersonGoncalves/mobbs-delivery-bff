import { randomUUID } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { isBillingBlocked } from '../../billing/domain/billing';
import { BillingBlockedError } from '../../../shared/http/billing-blocked.error';
import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';
import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { ICouponRepository } from '../../coupons/domain/repositories/coupon.repository.interface';
import { validateCoupon } from '../../coupons/domain/services/coupon-validator';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { computeOrderPricing } from '../../orders/domain/compute-order-pricing';
import { resolveInitialOrderStatus } from '../../orders/domain/resolve-initial-order-status';
import { OrderType, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { StockReservationService } from '../../orders/domain/services/stock-reservation.service';
import { resolveDeliveryFee } from '../../orders/presentation/orders.controller';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { applyManualAdjustment } from '../domain/apply-manual-adjustment';
import { OperatorDraftModality } from '../domain/entities/operator-draft.entity';
import { validateDraftForFinalize } from '../domain/validate-draft-for-finalize';
import { IOperatorDraftRepository } from '../domain/repositories/operator-draft.repository.interface';
import {
  clearOperatorDraftSchema,
  customerByPhoneQuerySchema,
  finalizeOperatorDraftSchema,
  parseSlotParam,
  quickCreateCustomerSchema,
  saveOperatorDraftSchema,
} from './operator-drafts.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const MODALITY_TO_ORDER_TYPE: Record<OperatorDraftModality, OrderType> = {
  delivery: 'delivery',
  pickup: 'pickup',
  counter: 'table',
};

/**
 * specs/0174-pdv-extensao-chrome-lateral — "dois rascunhos sincronizados entre a extensão e o PDV
 * web" (REQ-8/REQ-9/REQ-10/REQ-11), autorização restrita a Dono/Gerente/Caixa (REQ-5, nunca
 * Garçom/Motoboy) e finalização idempotente/concorrente segura (REQ-23, plan.md §6: o "claim"
 * atômico `tryClaimForFinalize` é a barreira real, não um botão desabilitado na tela).
 *
 * Sincronização em si é **poll curto** (REQ-10, aproximação deliberada e documentada em
 * `plan.md` — este ecossistema não tem infraestrutura de WebSocket em nenhum outro lugar): tanto
 * a extensão quanto o PDV web chamam `GET .../operator-drafts/:slot` a cada ~2s enquanto visíveis,
 * e usam a `revision` devolvida pra decidir se precisam re-renderizar.
 */
export class OperatorDraftsController extends BaseRouter {
  private readonly stockReservationService?: StockReservationService;

  constructor(
    private readonly operatorDraftRepository: IOperatorDraftRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly addressRepository: IAddressRepository,
    private readonly blockedCustomerRepository: IBlockedCustomerRepository,
    private readonly couponRepository: ICouponRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    stockMovementRepository?: IStockMovementRepository,
    rawMaterialRepository?: IRawMaterialRepository,
    productRepository?: IProductRepository,
  ) {
    super();
    if (productRepository && rawMaterialRepository && stockMovementRepository) {
      this.stockReservationService = new StockReservationService(productRepository, rawMaterialRepository, stockMovementRepository);
    }
  }

  initializeRoutes(application: Server): void {
    // REQ-5 — Dono, Gerente e Caixa (`financeiro`); explicitamente NUNCA Garçom/Motoboy/Cozinha.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    // REQ-4/REQ-8 — primeira leitura de um slot nunca é 404: cria vazio na hora.
    application.get('/restaurants/me/operator-drafts/:slot', ...authenticated, async (req: Request, res: Response) => {
      const slot = parseSlotParam(req.params);
      const draft = await this.operatorDraftRepository.findOrCreate(req.restaurantId!, req.operatorId!, slot);
      res.json(200, draft);
    });

    // REQ-9/REQ-11 — escrita otimista; 409 com o estado atual do servidor em conflito.
    application.put('/restaurants/me/operator-drafts/:slot', ...authenticated, async (req: Request, res: Response) => {
      const slot = parseSlotParam(req.params);
      const payload = parseBody(saveOperatorDraftSchema, req.body);
      const { revision, origin, ...patch } = payload;
      const result = await this.operatorDraftRepository.save(req.restaurantId!, req.operatorId!, slot, revision, {
        ...patch,
        lastEditedFrom: origin,
      });
      res.json(result.ok ? 200 : 409, result.draft);
    });

    // REQ-12 — limpar exige confirmação já feita no client; aqui só a concorrência otimista
    // protege contra limpar uma revisão que o operador não viu (mesmo raciocínio de `save`).
    application.del('/restaurants/me/operator-drafts/:slot', ...authenticated, async (req: Request, res: Response) => {
      const slot = parseSlotParam(req.params);
      const payload = parseBody(clearOperatorDraftSchema, req.body ?? {});
      const result = await this.operatorDraftRepository.clear(req.restaurantId!, req.operatorId!, slot, payload.revision);
      res.json(result.ok ? 200 : 409, result.draft);
    });

    // REQ-22/REQ-23 — ver cabeçalho da classe; plan.md §6 documenta o desenho do claim atômico.
    application.post('/restaurants/me/operator-drafts/:slot/finalize', ...authenticated, async (req: Request, res: Response) => {
      const slot = parseSlotParam(req.params);
      const payload = parseBody(finalizeOperatorDraftSchema, req.body);
      await this.handleFinalize(req, res, slot, payload);
    });

    // REQ-14/REQ-15 — busca por telefone (normalizado, sem duplicar por formatação), escopada ao
    // restaurante do operador (nunca expõe cliente/endereço de outro restaurante — AC-10).
    application.get('/restaurants/me/operator-drafts/customers', ...authenticated, async (req: Request, res: Response) => {
      const { phone } = parseBody(customerByPhoneQuerySchema, req.query);
      const normalized = normalizePhoneNumber(phone);
      const customer = await this.customerRepository.findByPhone(normalized);
      // Pedido explícito do usuário (achado real) — mesmo raciocínio de `OrdersController`: o
      // liga/desliga do restaurante (`customerBlockingEnabled`) precisa governar se a lista de
      // bloqueados é sequer consultada também aqui no PDV, não só no checkout do app do cliente.
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      const blocked = !!restaurant?.customerBlockingEnabled
        && (await this.blockedCustomerRepository.isBlocked(req.restaurantId!, normalized));
      if (!customer) {
        res.json(200, { customer: null, addresses: [], blocked });
        return;
      }
      // REQ-15 — só mostra endereços de um cliente que já pediu neste restaurante (mesmo
      // raciocínio de isolamento de `CustomersSummaryController`), nunca de qualquer `customerId`.
      const ownOrders = await this.orderRepository.findManyByCustomerAndRestaurant(customer.id, req.restaurantId!);
      const addresses = ownOrders.length > 0 ? await this.addressRepository.listByCustomer(customer.id) : [];
      res.json(200, { customer: { id: customer.id, name: customer.name, phone: customer.phone }, addresses, blocked });
    });

    // REQ-14 — cadastro rápido quando a busca por telefone não encontra ninguém; nunca duplica
    // (resolve pelo telefone normalizado de novo antes de criar, mesmo cuidado de
    // `TotemController.createStandalone`).
    application.post('/restaurants/me/operator-drafts/customers', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(quickCreateCustomerSchema, req.body);
      const normalized = normalizePhoneNumber(payload.phone);
      const existing = await this.customerRepository.findByPhone(normalized);
      if (existing) {
        res.json(200, { id: existing.id, name: existing.name, phone: existing.phone });
        return;
      }
      const created = await this.customerRepository.createStandalone(payload.name, normalized);
      res.json(201, { id: created.id, name: created.name, phone: created.phone });
    });
  }

  private async handleFinalize(
    req: Request,
    res: Response,
    slot: 1 | 2,
    payload: { revision: number; clientRequestId: string; origin?: 'web' | 'extensao' },
  ): Promise<void> {
    const restaurantId = req.restaurantId!;
    const operatorId = req.operatorId!;

    const current = await this.operatorDraftRepository.findOrCreate(restaurantId, operatorId, slot);

    // REQ-23 — rascunho já finalizado: qualquer finalize subsequente (clique duplo, reenvio após
    // timeout, ou uma segunda superfície tentando o mesmo rascunho) devolve o MESMO pedido, nunca
    // cria outro — independente do `clientRequestId` recebido.
    if (current.status === 'finalized' && current.orderId) {
      const order = await this.orderRepository.findById(current.orderId);
      res.json(200, { order, draft: current });
      return;
    }
    // REQ-23 — uma finalização já está em andamento (claim de outra requisição concorrente);
    // "Verificando envio" — o client deve consultar de novo em vez de tentar criar outro pedido.
    if (current.status === 'finalizing') {
      res.json(202, { status: 'verificando', draft: current });
      return;
    }
    if (current.revision !== payload.revision) {
      res.json(409, { draft: current });
      return;
    }

    const restaurant = await this.restaurantRepository.findById(restaurantId);
    if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
    if (isBillingBlocked(restaurant.billing)) throw new BillingBlockedError();

    validateDraftForFinalize({
      modality: current.modality,
      items: current.items,
      customerName: current.customerName,
      customerPhone: current.customerPhone,
      deliveryAddress: current.deliveryAddress,
      paymentMethod: current.paymentMethod,
    });

    // Pedido explícito do usuário (achado real) — mesmo raciocínio do GET .../customers acima:
    // sem `customerBlockingEnabled`, nem consulta a lista de bloqueados.
    if (restaurant.customerBlockingEnabled && current.customerPhone) {
      const normalizedPhone = normalizePhoneNumber(current.customerPhone);
      if (await this.blockedCustomerRepository.isBlocked(restaurantId, normalizedPhone)) {
        throw new ForbiddenError('Cliente bloqueado neste restaurante');
      }
    }

    // REQ-20 — só as formas efetivamente permitidas (restaurante ∩ cliente, specs/0171), nunca a
    // UI sozinha decidindo.
    const customer = current.customerId ? await this.customerRepository.findById(current.customerId) : null;
    const allowedMethods = this.resolveAllowedPaymentMethods(restaurant, customer?.allowedPaymentMethods);
    if (!allowedMethods.includes(current.paymentMethod!)) {
      throw new BadRequestError('Forma de pagamento não disponível para este cliente/restaurante');
    }

    // Claim atômico — só depois dele é seguro criar o pedido (plan.md §6).
    const claim = await this.operatorDraftRepository.tryClaimForFinalize(restaurantId, operatorId, slot, payload.revision);
    if (!claim.ok) {
      if (claim.draft.status === 'finalized' && claim.draft.orderId) {
        const order = await this.orderRepository.findById(claim.draft.orderId);
        res.json(200, { order, draft: claim.draft });
        return;
      }
      res.json(claim.draft.status === 'finalizing' ? 202 : 409, { draft: claim.draft });
      return;
    }

    try {
      const orderType = MODALITY_TO_ORDER_TYPE[current.modality];
      const { subtotal } = computeOrderPricing({ items: current.items, deliveryFee: 0, discount: 0, cashbackUsed: 0 });
      const deliveryFee = resolveDeliveryFee(restaurant, { orderType, deliveryNeighborhood: current.deliveryNeighborhood });

      let discount = 0;
      let couponCode: string | undefined;
      if (current.couponCode) {
        const normalizedCode = current.couponCode.trim().toUpperCase();
        const coupon = await this.couponRepository.findByCode(restaurantId, normalizedCode);
        const usageCount = coupon && customer ? await this.orderRepository.countByCustomerAndCoupon(restaurantId, customer.id, coupon.code) : 0;
        const result = validateCoupon({ coupon, orderSubtotal: subtotal, now: new Date(), customerUsageCount: usageCount });
        if (result.valid === false) throw new BadRequestError(result.reason);
        const incremented = await this.couponRepository.incrementUsageIfWithinLimit(coupon!.id);
        if (!incremented) throw new ConflictError('Cupom atingiu o limite de uso');
        discount = result.discountAmount;
        couponCode = coupon!.code;
      }

      const { total: totalBeforeAdjustment } = computeOrderPricing({ items: current.items, deliveryFee, discount, cashbackUsed: 0 });
      const total = applyManualAdjustment(totalBeforeAdjustment, current.adjustment);

      // REQ-21/AC-14 — "R$ 40,00 é rejeitado" quando o total é R$ 45,00: troco informado nunca
      // pode ser menor que o total, validado no servidor (nunca só no client).
      if (current.paymentMethod === 'cash' && current.cashChangeFor !== undefined && current.cashChangeFor < total) {
        throw new BadRequestError('O valor do troco não pode ser menor que o total do pedido');
      }

      // REQ-22 — nunca o operador "virando" cliente: resolve/cria um `Customer` real (balcão usa
      // o mesmo padrão de cliente avulso do totem, specs/0155 REQ-16a) e carimba `operatorId`.
      const resolvedCustomer = customer ?? (await this.resolveOrCreateCustomer(current.modality, current.customerName, current.customerPhone));

      const orderId = randomUUID();
      let items = current.items;
      if (restaurant.stockControlEnabled && this.stockReservationService) {
        items = await this.stockReservationService.reserveOrderItems(
          restaurantId,
          current.items,
          true,
          orderId,
          `operator-draft:${operatorId}:${slot}:${payload.clientRequestId}`,
        );
      }

      const initialStatus = resolveInitialOrderStatus(current.paymentMethod!, restaurant);
      const order = await this.orderRepository.create({
        id: orderId,
        idempotencyKey: payload.clientRequestId,
        customerId: resolvedCustomer.id,
        restaurantId,
        items,
        orderType,
        source: payload.origin === 'extensao' ? 'operador-extensao' : 'operador-web',
        operatorId,
        deliveryAddress: current.modality === 'delivery' ? current.deliveryAddress : undefined,
        notes: current.notes,
        subtotal,
        deliveryFee,
        discount,
        total,
        paymentMethod: current.paymentMethod!,
        cashChangeFor: current.cashChangeFor,
        couponCode,
        initialStatus,
      });

      const finalizedDraft = await this.operatorDraftRepository.markFinalized(restaurantId, operatorId, slot, order.id, payload.clientRequestId);
      res.json(201, { order, draft: finalizedDraft });
    } catch (error) {
      // REQ-24 — falha antes da criação mantém o rascunho (nunca finalizado, nunca perdido):
      // desfaz o claim pra o operador poder tentar de novo com os mesmos dados.
      await this.operatorDraftRepository.rollbackClaim(restaurantId, operatorId, slot);
      throw error;
    }
  }

  private resolveAllowedPaymentMethods(restaurant: IRestaurant, customerAllowed?: PaymentMethod[] | null): PaymentMethod[] {
    const restaurantAccepted = restaurant.acceptedPaymentMethods ?? [];
    if (!customerAllowed || customerAllowed.length === 0) return restaurantAccepted;
    return restaurantAccepted.filter((method) => customerAllowed.includes(method));
  }

  private async resolveOrCreateCustomer(modality: OperatorDraftModality, name?: string, phone?: string) {
    if (modality === 'counter' && !phone) {
      // REQ-13/REQ-22 — balcão sem identificação ainda precisa de um `Customer` (todo `Order`
      // sempre tem um, `order.entity.ts`); mesmo padrão de cliente avulso de balcão (specs/0120).
      return this.customerRepository.createStandalone('Cliente balcão');
    }
    const normalizedPhone = normalizePhoneNumber(phone!);
    const existing = await this.customerRepository.findByPhone(normalizedPhone);
    if (existing) return existing;
    return this.customerRepository.createStandalone(name ?? 'Cliente balcão', normalizedPhone);
  }
}
