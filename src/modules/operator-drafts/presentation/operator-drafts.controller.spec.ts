import type { Request, Response, Server } from 'restify';

import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { ICouponRepository } from '../../coupons/domain/repositories/coupon.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
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
  customerRepository?: Partial<ICustomerRepository>;
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
    ...overrides.customerRepository,
  };
  const addressRepository: Partial<IAddressRepository> = { listByCustomer: jest.fn().mockResolvedValue([]) };
  const blockedCustomerRepository: Partial<IBlockedCustomerRepository> = { isBlocked: jest.fn().mockResolvedValue(false) };
  const couponRepository: Partial<ICouponRepository> = { findByCode: jest.fn().mockResolvedValue(null) };

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
  ).initializeRoutes(application);

  return { routes, operatorDraftRepository, orderRepository, restaurantRepository, customerRepository };
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
  });
});
