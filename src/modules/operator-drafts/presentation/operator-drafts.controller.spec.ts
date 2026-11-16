import type { Request, Response, Server } from 'restify';

import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { ICouponRepository } from '../../coupons/domain/repositories/coupon.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRestaurantTableRepository } from '../../table-service/domain/repositories/table.repository.interface';
import { ITableWaiterRepository } from '../../table-service/domain/repositories/waiter.repository.interface';
import { ITableMapLayoutRepository } from '../../table-service/domain/repositories/table-map-layout.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { FiscalEmissionService } from '../../fiscal-integration/domain/services/fiscal-emission.service';
import { IOperatorDraft, OperatorDraftPatch, emptyDraftPatch } from '../domain/entities/operator-draft.entity';
import { IOperatorDraftRepository, OperatorDraftWriteResult } from '../domain/repositories/operator-draft.repository.interface';
import { OperatorDraftsController } from './operator-drafts.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  restaurantId?: string;
  operatorId?: string;
  operatorRole?: Request['operatorRole'];
};
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DELETE ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware + restaurantOperatorMiddleware + requireOperatorRole (3 primeiros) —
// mesmo padrão de `table-service.controller.spec.ts`/`totem.controller.spec.ts`.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

/**
 * Fake em memória com a MESMA semântica atômica do `OperatorDraftMongooseRepository` real
 * (filtro por revisão/status antes de aceitar a escrita) — permite testar concorrência de verdade
 * (REQ-11/REQ-23) sem precisar de um Mongo real no teste unitário.
 */
class FakeOperatorDraftRepository implements IOperatorDraftRepository {
  private byKey = new Map<string, IOperatorDraft>();
  private seq = 0;

  private key(restaurantId: string, operatorId: string, slot: 1 | 2): string {
    return `${restaurantId}:${operatorId}:${slot}`;
  }

  async findOrCreate(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft> {
    const key = this.key(restaurantId, operatorId, slot);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const created: IOperatorDraft = {
      id: `d-${++this.seq}`,
      restaurantId,
      operatorId,
      slot,
      revision: 0,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      ...emptyDraftPatch(),
    };
    this.byKey.set(key, created);
    return created;
  }

  async findBySlot(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft | null> {
    return this.byKey.get(this.key(restaurantId, operatorId, slot)) ?? null;
  }

  // Leitura+checagem+escrita SEMPRE síncronas (sem `await` entre elas) nos quatro métodos abaixo
  // — é o que faz este fake reproduzir de verdade a atomicidade do `findOneAndUpdate` do Mongo
  // (ver `operator-draft.mongoose.repository.ts`) sob concorrência real (`Promise.all` nos
  // testes); usar `await this.findOrCreate(...)` aqui dentro reabriria a mesma janela de corrida
  // que estes métodos existem pra eliminar (bug encontrado escrevendo este teste).
  private readSync(restaurantId: string, operatorId: string, slot: 1 | 2): IOperatorDraft {
    const key = this.key(restaurantId, operatorId, slot);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const created: IOperatorDraft = {
      id: `d-${++this.seq}`,
      restaurantId,
      operatorId,
      slot,
      revision: 0,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      ...emptyDraftPatch(),
    };
    this.byKey.set(key, created);
    return created;
  }

  async save(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number, patch: OperatorDraftPatch): Promise<OperatorDraftWriteResult> {
    const key = this.key(restaurantId, operatorId, slot);
    const current = this.readSync(restaurantId, operatorId, slot);
    if (current.status !== 'draft' || current.revision !== expectedRevision) return { ok: false, draft: current };
    const updated: IOperatorDraft = { ...current, ...patch, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    this.byKey.set(key, updated);
    return { ok: true, draft: updated };
  }

  async clear(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult> {
    const key = this.key(restaurantId, operatorId, slot);
    const current = this.readSync(restaurantId, operatorId, slot);
    if (current.revision !== expectedRevision || current.status === 'finalizing') return { ok: false, draft: current };
    const updated: IOperatorDraft = {
      ...current,
      ...emptyDraftPatch(),
      status: 'draft',
      orderId: undefined,
      finalizedClientRequestId: undefined,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.byKey.set(key, updated);
    return { ok: true, draft: updated };
  }

  async tryClaimForFinalize(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult> {
    const key = this.key(restaurantId, operatorId, slot);
    const current = this.readSync(restaurantId, operatorId, slot);
    if (current.status !== 'draft' || current.revision !== expectedRevision) return { ok: false, draft: current };
    const updated: IOperatorDraft = { ...current, status: 'finalizing', revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    this.byKey.set(key, updated);
    return { ok: true, draft: updated };
  }

  async markFinalized(restaurantId: string, operatorId: string, slot: 1 | 2, orderId: string, clientRequestId: string): Promise<IOperatorDraft> {
    const key = this.key(restaurantId, operatorId, slot);
    const current = this.readSync(restaurantId, operatorId, slot);
    const updated: IOperatorDraft = { ...current, status: 'finalized', orderId, finalizedClientRequestId: clientRequestId, updatedAt: new Date().toISOString() };
    this.byKey.set(key, updated);
    return updated;
  }

  async rollbackClaim(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft> {
    const key = this.key(restaurantId, operatorId, slot);
    const current = this.readSync(restaurantId, operatorId, slot);
    const updated: IOperatorDraft = { ...current, status: 'draft', updatedAt: new Date().toISOString() };
    this.byKey.set(key, updated);
    return updated;
  }
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    acceptedPaymentMethods: ['cash', 'pix', 'creditCard'],
    deliveryFeeMode: 'fixed',
    deliveryFeeCents: 500,
    deliveryFeeZones: [],
    stockControlEnabled: false,
    autoConfirmPaymentMethods: [],
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return { id: 'i-1', productId: 'p-1', productName: 'Produto', quantity: 1, unitPrice: 20, selections: [], ...overrides };
}

function buildController(overrides: {
  operatorDraftRepository?: IOperatorDraftRepository;
  orderRepository?: Partial<IOrderRepository>;
  restaurantRepository?: Partial<IRestaurantRepository>;
  blockedCustomerRepository?: Partial<IBlockedCustomerRepository>;
  customerRepository?: Partial<ICustomerRepository>;
  productRepository?: Partial<IProductRepository>;
  // Pedido explícito do usuário (16/11/2026) — balcão fecha sozinho no PDV
  // (`TableOrderService.closeOrder`, ver `OperatorDraftsController`). `enableTableOrderService`
  // injeta o mínimo necessário pra isso existir de verdade (sem ele, o controller se comporta
  // exatamente como antes desta feature — nunca fecha sozinho).
  enableTableOrderService?: boolean;
  fiscalEmissionService?: Partial<FiscalEmissionService>;
  cashRegisterService?: Partial<ICashRegisterService>;
} = {}) {
  const operatorDraftRepository = overrides.operatorDraftRepository ?? new FakeOperatorDraftRepository();
  const createdOrders = new Map<string, Record<string, unknown>>();
  const orderRepository: Partial<IOrderRepository> = {
    create: jest.fn().mockImplementation(async (input) => {
      const order = { orderNumber: createdOrders.size + 1, trackingToken: 'tok', ...input };
      createdOrders.set(order.id, order);
      return order;
    }),
    countByCustomerAndCoupon: jest.fn().mockResolvedValue(0),
    findById: jest.fn().mockImplementation(async (id: string) => createdOrders.get(id) ?? null),
    findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]),
    // Pedido explícito do usuário (16/11/2026) — usado por `TableOrderService.closeOrder` (fechar
    // o balcão sozinho no PDV, ver `enableTableOrderService` acima); muta o pedido guardado aqui
    // igual o Mongoose faria de verdade, pra `findById` depois devolver o pedido já fechado.
    closeTableOrder: jest.fn().mockImplementation(async (id: string, _restaurantId: string, input: { payments: unknown; closedAt: string; clientRequestId: string }) => {
      const existing = createdOrders.get(id);
      if (!existing) return null;
      const closed = { ...existing, status: 'entregue', tableClosedAt: input.closedAt, tablePayments: input.payments, tableCloseClientRequestId: input.clientRequestId };
      createdOrders.set(id, closed);
      return closed;
    }),
    ...overrides.orderRepository,
  };
  const restaurantRepository: Partial<IRestaurantRepository> = {
    findById: jest.fn().mockResolvedValue(buildRestaurant()),
    ...overrides.restaurantRepository,
  };
  const customerRepository: Partial<ICustomerRepository> = {
    findByPhone: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    createStandalone: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Cliente', phone: '5511999999999' }),
    createByRestaurant: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Cliente', phone: '5511999999999', createdByRestaurantId: 'r-1' }),
    ...overrides.customerRepository,
  };
  const addressRepository: Partial<IAddressRepository> = { listByCustomer: jest.fn().mockResolvedValue([]) };
  const blockedCustomerRepository: Partial<IBlockedCustomerRepository> = {
    isBlocked: jest.fn().mockResolvedValue(false),
    ...overrides.blockedCustomerRepository,
  };
  const couponRepository: Partial<ICouponRepository> = { findByCode: jest.fn().mockResolvedValue(null) };

  // Achado de auditoria (2026-10-31) — opcional (`undefined` por default) pra não quebrar os
  // testes acima que não têm nada a ver com preço: sem `productRepository`,
  // `rejeitaPriceMismatches` nem roda (mesmo padrão do `stockReservationService` logo abaixo).
  const productRepository: Partial<IProductRepository> | undefined = overrides.productRepository;

  // Pedido explícito do usuário (16/11/2026) — mínimo necessário pra `TableOrderService` existir
  // de verdade no controller (ver docstring do campo `enableTableOrderService` acima); nenhum dos
  // métodos de mesa/garçom/layout é chamado por `closeOrder`, só precisam existir como objeto.
  const tableRepository = { releaseFromOrder: jest.fn().mockResolvedValue(true) };
  const waiterRepository = {};
  const layoutRepository = {};
  const restaurantOperatorRepository = {};
  const fiscalEmissionService = overrides.fiscalEmissionService
    ? { emitForOrder: jest.fn().mockResolvedValue(undefined), ...overrides.fiscalEmissionService }
    : undefined;
  const cashRegisterService = overrides.cashRegisterService
    ? { addAutomaticEntry: jest.fn().mockResolvedValue(undefined), ...overrides.cashRegisterService }
    : undefined;

  const { application, routes } = buildFakeApplication();
  const noopMiddleware = async () => {};
  new OperatorDraftsController(
    operatorDraftRepository,
    orderRepository as IOrderRepository,
    restaurantRepository as IRestaurantRepository,
    customerRepository as ICustomerRepository,
    addressRepository as IAddressRepository,
    blockedCustomerRepository as IBlockedCustomerRepository,
    couponRepository as ICouponRepository,
    noopMiddleware,
    overrides.enableTableOrderService ? ({} as IStockMovementRepository) : undefined,
    overrides.enableTableOrderService ? ({} as IRawMaterialRepository) : undefined,
    (productRepository ?? (overrides.enableTableOrderService ? { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', price: 20, additionalGroups: [] }) } : undefined)) as IProductRepository | undefined,
    overrides.enableTableOrderService ? (tableRepository as unknown as IRestaurantTableRepository) : undefined,
    overrides.enableTableOrderService ? (waiterRepository as unknown as ITableWaiterRepository) : undefined,
    overrides.enableTableOrderService ? (layoutRepository as unknown as ITableMapLayoutRepository) : undefined,
    overrides.enableTableOrderService ? (restaurantOperatorRepository as unknown as IRestaurantOperatorRepository) : undefined,
    cashRegisterService as ICashRegisterService | undefined,
    fiscalEmissionService as FiscalEmissionService | undefined,
  ).initializeRoutes(application);

  return { routes, operatorDraftRepository, orderRepository, restaurantRepository, customerRepository, blockedCustomerRepository, fiscalEmissionService, cashRegisterService, tableRepository };
}

describe('OperatorDraftsController (specs/0174-pdv-extensao-chrome-lateral)', () => {
  const baseReq = { restaurantId: 'r-1', operatorId: 'op-1' };

  describe('REQ-5 — restrição de papel', () => {
    it('permite dono/gerente/financeiro e rejeita garcom/motoboy', async () => {
      const { routes } = buildController();
      const response = { json: jest.fn() };
      await expect(routes['GET /restaurants/me/operator-drafts/:slot'][2]({ operatorRole: 'financeiro' as const }, response)).resolves.toBeUndefined();
      await expect(routes['GET /restaurants/me/operator-drafts/:slot'][2]({ operatorRole: 'garcom' as const }, response)).rejects.toMatchObject({ statusCode: 403 });
      await expect(routes['GET /restaurants/me/operator-drafts/:slot'][2]({ operatorRole: 'motoboy' as const }, response)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('GET — primeira leitura nunca é 404', () => {
    it('cria um rascunho vazio (revision 0) se ainda não existir', async () => {
      const { routes } = buildController();
      const response = { json: jest.fn() };
      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/:slot'], { ...baseReq, params: { slot: '1' } }, response);
      expect(response.json).toHaveBeenCalledWith(200, expect.objectContaining({ revision: 0, status: 'draft', slot: 1 }));
    });
  });

  describe('PUT — REQ-9/REQ-11 concorrência otimista', () => {
    it('AC-8: duas edições na mesma revisão — só uma é aceita, a outra recebe 409 com o estado atual', async () => {
      const { routes } = buildController();
      const resA = { json: jest.fn() };
      const resB = { json: jest.fn() };
      const bodyA = { revision: 0, modality: 'counter', items: [buildItem()], origin: 'web' };
      const bodyB = { revision: 0, modality: 'counter', items: [buildItem({ id: 'i-2' })], origin: 'extensao' };

      await runOperatorChain(routes['PUT /restaurants/me/operator-drafts/:slot'], { ...baseReq, params: { slot: '1' }, body: bodyA }, resA);
      await runOperatorChain(routes['PUT /restaurants/me/operator-drafts/:slot'], { ...baseReq, params: { slot: '1' }, body: bodyB }, resB);

      expect(resA.json).toHaveBeenCalledWith(200, expect.objectContaining({ revision: 1 }));
      expect(resB.json).toHaveBeenCalledWith(409, expect.objectContaining({ revision: 1, items: [expect.objectContaining({ id: 'i-1' })] }));
    });
  });

  describe('POST .../finalize — REQ-23 idempotência e concorrência', () => {
    function financeiroReq(slot: string, body: Record<string, unknown>) {
      return { ...baseReq, params: { slot }, body };
    }

    it('AC-16: clientRequestId repetido devolve o MESMO pedido, sem criar um segundo', async () => {
      const { routes, orderRepository } = buildController();
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
        putRes,
      );

      const res1 = { json: jest.fn() };
      const res2 = { json: jest.fn() };
      const body = { revision: 1, clientRequestId: 'req-abc' };
      await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', body), res1);
      await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', body), res2);

      expect(orderRepository.create).toHaveBeenCalledTimes(1);
      const firstCallOrderId = (res1.json as jest.Mock).mock.calls[0][1].order.id;
      const secondCallOrderId = (res2.json as jest.Mock).mock.calls[0][1].order.id;
      expect(secondCallOrderId).toBe(firstCallOrderId);
    });

    it('AC-16: finalização concorrente (duas chamadas, mesma revisão, client-request-id diferentes) cria no máximo um pedido', async () => {
      const { routes, orderRepository } = buildController();
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
        putRes,
      );

      const resWeb = { json: jest.fn() };
      const resExtensao = { json: jest.fn() };
      await Promise.all([
        runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'web-1', origin: 'web' }), resWeb),
        runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'ext-1', origin: 'extensao' }), resExtensao),
      ]);

      expect(orderRepository.create).toHaveBeenCalledTimes(1);
    });

    it('AC-8: revisão desatualizada não finaliza — devolve 409 preservando o rascunho atual', async () => {
      const { routes } = buildController();
      const res = { json: jest.fn() };
      await runOperatorChain(
        routes['POST /restaurants/me/operator-drafts/:slot/finalize'],
        financeiroReq('1', { revision: 99, clientRequestId: 'req-x' }),
        res,
      );
      expect(res.json).toHaveBeenCalledWith(409, expect.anything());
    });

    it('AC-9: balcão (counter) finaliza sem cliente identificado', async () => {
      const { routes, orderRepository } = buildController();
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('2', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
        putRes,
      );
      const res = { json: jest.fn() };
      await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('2', { revision: 1, clientRequestId: 'r-1' }), res);
      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ orderType: 'table', source: 'operador-web' }));
    });

    // Pedido explícito do usuário (16/11/2026) — balcão fecha sozinho no próprio PDV, sem
    // precisar visitar Atendimento de mesas: dispara o mesmíssimo `TableOrderService.closeOrder`
    // que uma mesa fechada manualmente usa.
    describe('balcão fecha sozinho no PDV (sem precisar de Atendimento de mesas)', () => {
      it('finaliza balcão já fechado (entregue, tableClosedAt), com nota fiscal emitida e caixa lançado', async () => {
        const { routes, fiscalEmissionService, cashRegisterService } = buildController({
          enableTableOrderService: true,
          fiscalEmissionService: {},
          cashRegisterService: {},
        });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem({ unitPrice: 20, quantity: 1 })], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-balcao-1' }), res);

        const { order } = (res.json as jest.Mock).mock.calls[0][1];
        expect(order.status).toBe('entregue');
        expect(order.tableClosedAt).toBeDefined();
        expect(fiscalEmissionService!.emitForOrder).toHaveBeenCalledWith(expect.objectContaining({ id: order.id, status: 'entregue' }));
        expect(cashRegisterService!.addAutomaticEntry).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id, amount: 20, paymentMethod: 'cash' }));
      });

      it.each(['delivery', 'pickup'])('delivery/retirada (%s) NUNCA fecha sozinho — continua "aguardandoConfirmacao" pro fluxo normal do kanban', async (modality) => {
        const { routes, fiscalEmissionService } = buildController({ enableTableOrderService: true, fiscalEmissionService: {} });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', {
            revision: 0, modality, items: [buildItem()], paymentMethod: 'cash',
            customerName: 'Ana', customerPhone: '5585999999999', deliveryAddress: 'Rua A, 1',
          }),
          putRes,
        );

        const res = { json: jest.fn() };
        await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: `r-${modality}-1` }), res);

        const { order } = (res.json as jest.Mock).mock.calls[0][1];
        expect(order.status).not.toBe('entregue');
        expect(order.tableClosedAt).toBeUndefined();
        expect(fiscalEmissionService!.emitForOrder).not.toHaveBeenCalled();
      });

      it('falha ao fechar sozinho nunca derruba a finalização — pedido criado continua na resposta (fecha manualmente em Atendimento de mesas depois)', async () => {
        const { routes, orderRepository } = buildController({
          enableTableOrderService: true,
          orderRepository: { closeTableOrder: jest.fn().mockRejectedValue(new Error('Mongo indisponível')) },
        });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-balcao-fail-1' }), res);

        expect(res.json).toHaveBeenCalledWith(201, expect.objectContaining({ order: expect.objectContaining({ orderType: 'table' }) }));
        expect(orderRepository.create).toHaveBeenCalledTimes(1);
      });

      it('sem TableOrderService configurado (defesa de composição), comporta-se como antes — balcão não fecha sozinho', async () => {
        const { routes } = buildController();
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-balcao-sem-service' }), res);

        const { order } = (res.json as jest.Mock).mock.calls[0][1];
        expect(order.status).not.toBe('entregue');
        expect(order.tableClosedAt).toBeUndefined();
      });
    });

    it('AC-14: troco menor que o total é rejeitado (400), sem criar pedido', async () => {
      const { routes, orderRepository } = buildController();
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem({ unitPrice: 45, quantity: 1 })], paymentMethod: 'cash', cashChangeFor: 40 }),
        putRes,
      );
      const res = { json: jest.fn() };
      await expect(
        runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-3' }), res),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    // Achado crítico da auditoria pré-produção (31/10/2026) — "preço do pedido nunca é
    // revalidado contra o catálogo real": diferente de `OrdersController`/`TotemController`, o
    // PDV não tinha `productRepository` nenhum antes (ver construtor). `productRepository` é
    // opcional (os testes acima não passam, e continuam passando sem essa checagem — mesmo
    // padrão de `stockReservationService`); só quando é passado (como aqui) a validação roda.
    describe('achado de auditoria (2026-10-31): revalidação de preço contra o catálogo real', () => {
      it('rejeita (400) quando unitPrice do rascunho não bate com o preço real do produto, sem criar pedido', async () => {
        const { routes, orderRepository } = buildController({
          productRepository: { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', price: 20, additionalGroups: [] }) },
        });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem({ unitPrice: 1 })], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await expect(
          runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-preco-1' }), res),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(orderRepository.create).not.toHaveBeenCalled();
      });

      it('rejeita (400) quando productId do rascunho é de outro restaurante, mesmo com unitPrice "correto"', async () => {
        const { routes, orderRepository } = buildController({
          productRepository: { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'outro-restaurante', price: 20, additionalGroups: [] }) },
        });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await expect(
          runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-preco-2' }), res),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(orderRepository.create).not.toHaveBeenCalled();
      });

      it('finaliza normalmente quando unitPrice bate com o preço real do produto', async () => {
        const { routes, orderRepository } = buildController({
          productRepository: { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', price: 20, additionalGroups: [] }) },
        });
        const putRes = { json: jest.fn() };
        await runOperatorChain(
          routes['PUT /restaurants/me/operator-drafts/:slot'],
          financeiroReq('1', { revision: 0, modality: 'counter', items: [buildItem()], paymentMethod: 'cash' }),
          putRes,
        );

        const res = { json: jest.fn() };
        await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-preco-3' }), res);

        expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 20 }));
      });
    });

    it('AC-9: retirada sem telefone é rejeitada (400) antes de criar pedido', async () => {
      const { routes, orderRepository } = buildController();
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'pickup', items: [buildItem()], paymentMethod: 'cash', customerName: 'Ana' }),
        putRes,
      );
      const res = { json: jest.fn() };
      await expect(
        runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-2' }), res),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    // Pedido explícito do usuário (achado real) — "O bloqueio de clientes está desabilitado" na
    // retaguarda (`customerBlockingEnabled: false`) não impedia a finalização no PDV mesmo pra um
    // telefone individualmente bloqueado; mesmo raciocínio do checkout do app (`OrdersController`).
    it('cliente bloqueado finaliza normalmente quando customerBlockingEnabled está desligado', async () => {
      const { routes, orderRepository } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: false })) },
        blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
      });
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'pickup', items: [buildItem()], paymentMethod: 'cash', customerName: 'Ana', customerPhone: '5511999999999' }),
        putRes,
      );
      const res = { json: jest.fn() };
      await runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-4' }), res);
      expect(orderRepository.create).toHaveBeenCalled();
    });

    it('cliente bloqueado é rejeitado (403) quando customerBlockingEnabled está ligado', async () => {
      const { routes, orderRepository } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: true })) },
        blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
      });
      const putRes = { json: jest.fn() };
      await runOperatorChain(
        routes['PUT /restaurants/me/operator-drafts/:slot'],
        financeiroReq('1', { revision: 0, modality: 'pickup', items: [buildItem()], paymentMethod: 'cash', customerName: 'Ana', customerPhone: '5511999999999' }),
        putRes,
      );
      const res = { json: jest.fn() };
      await expect(
        runOperatorChain(routes['POST /restaurants/me/operator-drafts/:slot/finalize'], financeiroReq('1', { revision: 1, clientRequestId: 'r-5' }), res),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });
  });

  // Pedido explícito do usuário (achado real) — mesmo bug do finalize acima, mas na busca por
  // telefone: a flag `blocked` devolvida pro PDV não podia ignorar `customerBlockingEnabled`.
  describe('GET .../operator-drafts/customers — REQ-14/REQ-15', () => {
    it('não marca "blocked" quando customerBlockingEnabled está desligado, mesmo com o telefone na lista', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: false })) },
        blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
      });
      const res = { json: jest.fn() };
      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);
      expect(res.json).toHaveBeenCalledWith(200, expect.objectContaining({ blocked: false }));
    });

    it('marca "blocked" quando customerBlockingEnabled está ligado e o telefone está na lista', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: true })) },
        blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
      });
      const res = { json: jest.fn() };
      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);
      expect(res.json).toHaveBeenCalledWith(200, expect.objectContaining({ blocked: true }));
    });

    // Achado crítico de auditoria (31/10/2026) — "findByPhone global permite correlação de PII
    // entre restaurantes": cliente existe (achado por `findByPhone`, busca GLOBAL), mas nunca
    // pediu neste restaurante nem foi cadastrado manualmente aqui — nunca revela nome/telefone.
    it('cliente existe globalmente mas nunca pediu/foi cadastrado neste restaurante: nunca revela o nome (trata como não encontrado)', async () => {
      const { routes, orderRepository } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({ id: 'c-outro', name: 'Fulano de Outro Restaurante', phone: '5511999999999' }),
        },
      });
      orderRepository.findManyByCustomerAndRestaurant = jest.fn().mockResolvedValue([]);
      const res = { json: jest.fn() };

      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);

      expect(res.json).toHaveBeenCalledWith(200, { customer: null, addresses: [], blocked: false });
    });

    it('cliente já pediu neste restaurante: revela nome e endereços normalmente', async () => {
      const { routes, orderRepository } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Maria', phone: '5511999999999' }),
        },
      });
      orderRepository.findManyByCustomerAndRestaurant = jest.fn().mockResolvedValue([{ id: 'o-1' }]);
      const res = { json: jest.fn() };

      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);

      expect(res.json).toHaveBeenCalledWith(200, expect.objectContaining({ customer: { id: 'c-1', name: 'Maria', phone: '5511999999999' } }));
    });

    it('cliente foi cadastrado manualmente por este restaurante (sem pedido ainda): revela o nome', async () => {
      const { routes } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Maria', phone: '5511999999999', createdByRestaurantId: 'r-1' }),
        },
      });
      const res = { json: jest.fn() };

      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);

      expect(res.json).toHaveBeenCalledWith(200, expect.objectContaining({ customer: { id: 'c-1', name: 'Maria', phone: '5511999999999' } }));
    });

    // T019 (specs/0174) — pré-requisito pra UI filtrar a lista de pagamento pelo cliente
    // (interseção com `restaurant.acceptedPaymentMethods`, mesma regra do finalize).
    it('devolve allowedPaymentMethods do cliente, quando configurado', async () => {
      const { routes } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({
            id: 'c-1',
            name: 'Maria',
            phone: '5511999999999',
            createdByRestaurantId: 'r-1',
            allowedPaymentMethods: ['cash', 'pix'],
          }),
        },
      });
      const res = { json: jest.fn() };

      await runOperatorChain(routes['GET /restaurants/me/operator-drafts/customers'], { ...baseReq, query: { phone: '5511999999999' } }, res);

      expect(res.json).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ customer: expect.objectContaining({ allowedPaymentMethods: ['cash', 'pix'] }) }),
      );
    });
  });

  describe('POST .../operator-drafts/customers (cadastro rápido)', () => {
    it('telefone desconhecido: cria um cliente avulso novo', async () => {
      const { routes, customerRepository } = buildController();
      const res = { json: jest.fn() };

      await runOperatorChain(
        routes['POST /restaurants/me/operator-drafts/customers'],
        { ...baseReq, body: { name: 'Ana', phone: '5511999999999' } },
        res,
      );

      expect(customerRepository.createStandalone).toHaveBeenCalledWith('Ana', '5511999999999');
      expect(res.json).toHaveBeenCalledWith(201, { id: 'c-1', name: 'Cliente', phone: '5511999999999' });
    });

    it('telefone já tem relação com este restaurante: reaproveita o cliente existente', async () => {
      const { routes, orderRepository } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Ana', phone: '5511999999999', createdByRestaurantId: 'r-1' }),
        },
      });
      orderRepository.findManyByCustomerAndRestaurant = jest.fn().mockResolvedValue([]);
      const res = { json: jest.fn() };

      await runOperatorChain(
        routes['POST /restaurants/me/operator-drafts/customers'],
        { ...baseReq, body: { name: 'Nome digitado agora', phone: '5511999999999' } },
        res,
      );

      expect(res.json).toHaveBeenCalledWith(200, { id: 'c-1', name: 'Ana', phone: '5511999999999' });
    });

    // Achado crítico de auditoria (31/10/2026) — mesmo raciocínio do GET acima: telefone já
    // existe globalmente (outro restaurante/app), mas nunca teve relação com ESTE restaurante —
    // nunca devolve o nome real de outro contexto, só o que o operador digitou agora.
    it('telefone existe globalmente mas sem relação com este restaurante: estabelece a relação agora e devolve o nome digitado pelo operador, nunca o de outro contexto', async () => {
      const { routes, customerRepository, orderRepository } = buildController({
        customerRepository: {
          findByPhone: jest.fn().mockResolvedValue({ id: 'c-outro', name: 'Fulano de Outro Restaurante', phone: '5511999999999' }),
          createByRestaurant: jest.fn().mockResolvedValue({ id: 'c-outro', name: 'Fulano de Outro Restaurante', phone: '5511999999999', createdByRestaurantId: 'r-1' }),
        },
      });
      orderRepository.findManyByCustomerAndRestaurant = jest.fn().mockResolvedValue([]);
      const res = { json: jest.fn() };

      await runOperatorChain(
        routes['POST /restaurants/me/operator-drafts/customers'],
        { ...baseReq, body: { name: 'Nome digitado agora', phone: '5511999999999' } },
        res,
      );

      expect(customerRepository.createByRestaurant).toHaveBeenCalledWith('r-1', 'Nome digitado agora', '5511999999999');
      expect(res.json).toHaveBeenCalledWith(200, { id: 'c-outro', name: 'Nome digitado agora', phone: '5511999999999' });
    });
  });
});
