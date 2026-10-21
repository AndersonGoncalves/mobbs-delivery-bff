import type { Request, Response, Server } from 'restify';

import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { ICouponRepository } from '../../coupons/domain/repositories/coupon.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { ICashRegisterService } from '../../financeiro/domain/services/i-cash-register.service';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { IRestaurantTableRepository } from '../../table-service/domain/repositories/table.repository.interface';
import { IBlockedCustomerRepository } from '../../customer-blocking/domain/repositories/blocked-customer.repository.interface';
import { AsaasClient } from '../../payments-asaas/infra/asaas-client';
import { OrdersController } from './orders.controller';

// specs/0101-integracao-asaas (fase 1) — `tryChargeOrderPixViaAsaas`/`tryRefundOrderPixViaAsaas`
// instanciam `AsaasClient` direto (não injetado via construtor, diferente dos repositórios),
// então o jeito de controlar o comportamento nos testes é mockar a classe inteira.
jest.mock('../../payments-asaas/infra/asaas-client');

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  user?: { uid: string; email?: string };
  restaurantId?: string;
  operatorRole?: string;
  operatorId?: string;
};
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware (primeiro da chain) — tem spec própria — e injeta `req.user`
// manualmente, como o middleware real faria.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// GET /orders/track/:token não tem firebaseAuthMiddleware (rota pública, REQ-8) — roda todos os
// handlers, sem pular o primeiro.
async function runPublicChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

// Rotas /restaurants/me/... (specs/0008-acompanhamento-vendas) passam por
// firebaseAuthMiddleware + restaurantOperatorMiddleware — pula os dois (cada um tem spec
// própria) e injeta `req.restaurantId` manualmente, como o middleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildRestaurant(
  overrides: Partial<{
    isActive: boolean;
    stockControlEnabled: boolean;
    orderTypes: ('delivery' | 'pickup')[];
    deliveryFeeCents: number;
    deliveryFeeMode: string;
    deliveryFeeZones: { id: string; neighborhood: string; feeCents: number }[];
    billing: { referenceMonth: string; currentTier: 'free' | 'pro' | 'premium'; notified75Percent: boolean; notifiedTierUpgrade: boolean; status: 'ok' | 'blocked'; cycle: 'monthly' | 'annual' };
    pixKey: string;
    pixKeyType: string;
    pixBeneficiaryName: string;
    address: { city: string };
    phone: string;
    notifyRestaurantOnNewOrder: boolean;
    newOrderRestaurantWhatsAppTemplate: string;
    customerBlockingEnabled: boolean;
    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-1.
    autoConfirmPaymentMethods: ('creditCard' | 'debitCard' | 'pix' | 'cash' | 'bankTransfer')[];
    // specs/0101-integracao-asaas (fase 1).
    onlinePaymentsEnabled: boolean;
    asaasApiKey: string;
  }> = {},
) {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    phone: '11912345678',
    orderTypes: ['delivery', 'pickup'],
    notifyRestaurantOnNewOrder: true,
    // specs/0055-checkout-revalida-restaurante-aberto — aberto o dia inteiro, todo dia, por
    // padrão (não é o foco da maioria dos testes deste arquivo); os testes específicos de
    // "restaurante fechado" (abaixo) sobrescrevem isso.
    businessHours: (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map((dayOfWeek) => ({
      dayOfWeek,
      isClosed: false,
      openTime: '00:00',
      closeTime: '23:59',
    })),
    minimumOrderValue: 0,
    deliveryFeeCents: 5,
    deliveryFeeMode: 'fixed',
    deliveryFeeZones: [],
    ...overrides,
  };
}

function buildPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'o-1',
    method: 'pix',
    status: 'pendente',
    amount: 30,
    ...overrides,
  };
}

function buildItem(overrides: Partial<{ unitPrice: number; quantity: number }> = {}) {
  return {
    id: 'i-1',
    productId: 'p-1',
    productName: 'Pizza',
    quantity: 1,
    unitPrice: 25,
    selections: [],
    ...overrides,
  };
}

function buildValidBody(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    paymentMethod: 'cash',
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    trackingToken: 'token-1',
    customerId: 'customer-1',
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    status: 'aguardandoConfirmacao',
    statusHistory: [{ status: 'aguardandoConfirmacao', changedAt: new Date().toISOString() }],
    subtotal: 25,
    deliveryFee: 5,
    discount: 0,
    total: 30,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    restaurantId: 'r-1',
    code: 'PROMO10',
    discountType: 'percentual' as const,
    discountValue: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    usageCount: 0,
    isActive: true,
    ...overrides,
  };
}

describe('OrdersController', () => {
  function setup(
    overrides: {
      orderRepository?: Partial<IOrderRepository>;
      restaurantRepository?: Partial<IRestaurantRepository>;
      paymentRepository?: Partial<IPaymentRepository>;
      couponRepository?: Partial<ICouponRepository>;
      productRepository?: Partial<IProductRepository>;
      stockMovementRepository?: Partial<IStockMovementRepository>;
      customerRepository?: Partial<ICustomerRepository>;
      restaurantOperatorRepository?: Partial<IRestaurantOperatorRepository>;
      tableRepository?: Partial<IRestaurantTableRepository>;
      rawMaterialRepository?: Partial<IRawMaterialRepository>;
      blockedCustomerRepository?: Partial<IBlockedCustomerRepository>;
    } = {},
  ) {
    const orderRepository: Partial<IOrderRepository> = {
      create: jest.fn().mockImplementation(async (input) => ({
        ...input,
        id: 'o-1',
        orderNumber: 1,
        trackingToken: 'token-1',
        // specs/0151-confirmacao-automatica-por-forma-pagamento — mesmo fallback do repositório
        // mongoose de verdade (`status: input.initialStatus ?? 'aguardandoConfirmacao'`), pra
        // testes poderem conferir o status da resposta quando `initialStatus` é passado.
        status: input.initialStatus ?? 'aguardandoConfirmacao',
        statusHistory: [],
        createdAt: new Date().toISOString(),
      })),
      findManyByCustomer: jest.fn().mockResolvedValue([buildOrder()]),
      findById: jest.fn().mockResolvedValue(buildOrder()),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findByTrackingToken: jest.fn().mockResolvedValue(buildOrder()),
      findActiveByRestaurant: jest.fn().mockResolvedValue([buildOrder()]),
      findActiveByRestaurantAndMotoboy: jest.fn().mockResolvedValue([buildOrder()]),
      findByRestaurantBetween: jest.fn().mockResolvedValue([]),
      assignDeliveryMotoboy: jest.fn().mockImplementation(async (_id, deliveryMotoboy) => ({ ...buildOrder(), deliveryMotoboy })),
      updateStatus: jest.fn().mockImplementation(async (id, status, changedBy, reason) => ({
        ...buildOrder(),
        status,
        statusHistory: [
          ...buildOrder().statusHistory,
          { status, changedAt: new Date().toISOString(), changedBy, reason },
        ],
      })),
      getSalesSummary: jest.fn().mockResolvedValue({
        restaurantId: 'r-1',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-30T23:59:59.999Z',
        totalOrders: 10,
        totalRevenue: 300,
        tableRevenue: 90,
        cancelledOrders: 1,
      }),
      countByCustomerAndCoupon: jest.fn().mockResolvedValue(0),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const restaurantOperatorMiddleware = jest.fn();
    const whatsAppNotificationService: IWhatsAppNotificationService = {
      sendOrderReceipt: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
      sendPaymentConfirmedMessage: jest.fn().mockResolvedValue(undefined),
    };
    const cashRegisterService: ICashRegisterService = {
      addAutomaticEntry: jest.fn().mockResolvedValue(undefined),
      syncOpenSession: jest.fn().mockResolvedValue(undefined),
      ensureAutomaticSchedule: jest.fn().mockResolvedValue(undefined),
      getBalanceByPaymentMethod: jest.fn().mockResolvedValue({}),
      getClosingSummary: jest.fn(),
    };
    const paymentRepository: Partial<IPaymentRepository> = {
      findByOrderId: jest.fn().mockResolvedValue(null),
      findManyByOrderIds: jest.fn().mockResolvedValue([]),
      markAsApproved: jest.fn().mockImplementation(async (orderId) => ({ ...buildPayment({ orderId }), status: 'aprovado' })),
      // specs/0101-integracao-asaas (fase 1).
      setAsaasPixDetails: jest.fn().mockImplementation(async (orderId, data) => ({ ...buildPayment({ orderId }), ...data })),
      markAsRefunded: jest.fn().mockImplementation(async (orderId) => ({ ...buildPayment({ orderId }), status: 'estornado' })),
      ...overrides.paymentRepository,
    };
    const couponRepository: Partial<ICouponRepository> = {
      findByCode: jest.fn().mockResolvedValue(null),
      incrementUsageIfWithinLimit: jest.fn().mockImplementation(async (id) => ({ ...buildCoupon({ id }), usageCount: 1 })),
      ...overrides.couponRepository,
    };
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16.
    const productRepository: Partial<IProductRepository> = {
      findById: jest.fn().mockResolvedValue(null),
      decrementStock: jest.fn().mockResolvedValue(false),
      decrementStockIfAvailable: jest.fn().mockResolvedValue(false),
      restoreStock: jest.fn().mockResolvedValue(true),
      ...overrides.productRepository,
    };
    const stockMovementRepository: Partial<IStockMovementRepository> = {
      findByOperationId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      ...overrides.stockMovementRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana', email: 'ana@exemplo.com', phone: '85984224877' }),
      ...overrides.customerRepository,
    };
    // specs/0137-papeis-garcom-motoboy REQ-6 — `RestaurantOperator` com papel `motoboy` (substitui
    // o antigo mock de `IMotoboyRepository` neste controller).
    const restaurantOperatorRepository: Partial<IRestaurantOperatorRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'm-1', restaurantId: 'r-1', email: 'carlos@exemplo.com', role: 'motoboy', isActive: true, createdAt: new Date() }),
      ...overrides.restaurantOperatorRepository,
    };
    const tableRepository: Partial<IRestaurantTableRepository> = {
      releaseFromOrder: jest.fn().mockResolvedValue(true),
      ...overrides.tableRepository,
    };
    const rawMaterialRepository: Partial<IRawMaterialRepository> = {
      findById: jest.fn().mockResolvedValue(null),
      decrementStockIfAvailable: jest.fn().mockResolvedValue(false),
      incrementStock: jest.fn().mockResolvedValue({}),
      ...overrides.rawMaterialRepository,
    };
    // Pedido explícito do usuário (módulo `customer-blocking`).
    const blockedCustomerRepository: Partial<IBlockedCustomerRepository> = {
      isBlocked: jest.fn().mockResolvedValue(false),
      ...overrides.blockedCustomerRepository,
    };
    const { application, routes } = buildFakeApplication();
    new OrdersController(
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      restaurantOperatorMiddleware,
      whatsAppNotificationService,
      cashRegisterService,
      paymentRepository as IPaymentRepository,
      couponRepository as ICouponRepository,
      productRepository as IProductRepository,
      stockMovementRepository as IStockMovementRepository,
      customerRepository as ICustomerRepository,
      restaurantOperatorRepository as IRestaurantOperatorRepository,
      undefined,
      tableRepository as IRestaurantTableRepository,
      rawMaterialRepository as IRawMaterialRepository,
      blockedCustomerRepository as IBlockedCustomerRepository,
    ).initializeRoutes(application);
    return {
      orderRepository,
      restaurantRepository,
      whatsAppNotificationService,
      cashRegisterService,
      paymentRepository,
      couponRepository,
      productRepository,
      stockMovementRepository,
      customerRepository,
      restaurantOperatorRepository,
      tableRepository,
      rawMaterialRepository,
      blockedCustomerRepository,
      routes,
    };
  }

  it('AC-2: POST /orders cria o pedido com subtotal/taxa/total calculados no BFF (não confia no cliente)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ items: [buildItem({ unitPrice: 25, quantity: 2 })] }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1', subtotal: 50, deliveryFee: 5, discount: 0, total: 55 }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1', orderNumber: 1 }));
  });

  // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-3/AC-2.
  it('specs/0151 AC-2: forma de pagamento configurada em autoConfirmPaymentMethods faz o pedido nascer confirmado', async () => {
    const { orderRepository, whatsAppNotificationService, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoConfirmPaymentMethods: ['cash'] })) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ paymentMethod: 'cash' }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ initialStatus: 'confirmado' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'confirmado' }));
    expect(whatsAppNotificationService.sendOrderStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-1', status: 'confirmado' }));
  });

  it('specs/0151: forma de pagamento fora de autoConfirmPaymentMethods nasce aguardandoConfirmacao, sem mudança', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoConfirmPaymentMethods: ['pix'] })) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ paymentMethod: 'cash' }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ initialStatus: undefined }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aguardandoConfirmacao' }));
  });

  it('specs/0151 AC-2 (Pix): Pix nunca nasce confirmado, mesmo com "pix" em autoConfirmPaymentMethods', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ pixKey: '11999999999', autoConfirmPaymentMethods: ['pix'] })) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ initialStatus: undefined }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aguardandoConfirmacao' }));
  });

  it('specs/0108 AC-9: replay da mesma chave devolve o pedido existente sem criar outro', async () => {
    const existing = buildOrder({ idempotencyKey: 'checkout-attempt-1' });
    const { orderRepository, routes } = setup({
      orderRepository: { findByIdempotencyKey: jest.fn().mockResolvedValue(existing) },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ idempotencyKey: 'checkout-attempt-1' }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.findByIdempotencyKey).toHaveBeenCalledWith('r-1', 'customer-1', 'checkout-attempt-1');
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, existing);
  });

  it('specs/0108 AC-6: cancelar pedido devolve cada reserva congelada', async () => {
    const item = {
      ...buildItem(),
      stockReservations: [{ resourceType: 'product', resourceId: 'p-1', unitsPerItem: 1, quantity: 1, operationId: 'reserve-1' }],
    };
    const { productRepository, stockMovementRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ items: [item] })) },
    });

    await runAuthenticatedChain(routes['PATCH /orders/:id/cancel'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json: jest.fn() });

    expect(productRepository.restoreStock).toHaveBeenCalledWith('p-1', 1);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'o-1', productId: 'p-1', type: 'entrada', quantity: 1, operationId: 'reserve-1:release',
    }));
  });

  it('specs/0108 AC-7: saldo insuficiente bloqueia checkout antes de criar pedido', async () => {
    const { orderRepository, productRepository, stockMovementRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ stockControlEnabled: true })) },
      productRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', tracksStock: true, stockQuantity: 1, additionalGroups: [] }),
        decrementStockIfAvailable: jest.fn().mockResolvedValue(false),
      },
    });

    await expect(runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ idempotencyKey: 'checkout-stock-1', items: [buildItem({ quantity: 2 })] }), user: { uid: 'customer-1' } },
      { json: jest.fn() },
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('p-1', 2);
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(stockMovementRepository.create).not.toHaveBeenCalled();
  });

  it('specs/0108 AC-2: checkout reserva saldo e congela snapshot de quantidade no pedido', async () => {
    const { orderRepository, productRepository, stockMovementRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ stockControlEnabled: true })) },
      productRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', tracksStock: true, stockQuantity: 8, additionalGroups: [] }),
        decrementStockIfAvailable: jest.fn().mockResolvedValue(true),
      },
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ idempotencyKey: 'checkout-reserve-1', items: [buildItem({ quantity: 2 })] }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(productRepository.decrementStockIfAvailable).toHaveBeenCalledWith('p-1', 2);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderId: expect.any(String), productId: 'p-1', type: 'saida', quantity: 2, operationId: expect.stringContaining('checkout-reserve-1'),
    }));
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'checkout-reserve-1',
      items: [expect.objectContaining({ stockReservations: [expect.objectContaining({ resourceId: 'p-1', quantity: 2 })] })],
    }));
  });

  it('specs/0108 AC-6: cancelar pedido com reserva devolve o saldo registrado', async () => {
    const reservedItem = {
      ...buildItem(),
      stockReservations: [{ resourceType: 'product', resourceId: 'p-1', unitsPerItem: 1, quantity: 1, operationId: 'reserve-1' }],
    };
    const { productRepository, stockMovementRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ items: [reservedItem] })) },
    });

    await runAuthenticatedChain(
      routes['PATCH /orders/:id/cancel'],
      { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
      { json: jest.fn() },
    );

    expect(productRepository.restoreStock).toHaveBeenCalledWith('p-1', 1);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'o-1', productId: 'p-1', type: 'entrada', quantity: 1, operationId: 'reserve-1:release',
    }));
  });

  // specs/0042 REQ-7 — restaurante bloqueado por inadimplência não aceita pedido novo, nem pela API direto.
  it('specs/0042: rejeita (403) pedido em restaurante bloqueado por inadimplência', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({
            billing: { referenceMonth: '2026-10', currentTier: 'pro', notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked', cycle: 'monthly' },
          }),
        ),
      },
    });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  // Nome e WhatsApp válido são obrigatórios no pedido (o restaurante precisa do WhatsApp pra confirmar).
  it('rejeita (400) pedido de cliente sem nome', async () => {
    const { orderRepository, routes } = setup({
      customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: '  ', email: 'a@x.com', phone: '85984224877' }) },
    });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita (400) pedido de cliente sem WhatsApp válido', async () => {
    const { orderRepository, routes } = setup({
      customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana', email: 'a@x.com', phone: '119999' }) },
    });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  // Pedido explícito do usuário (módulo `customer-blocking`).
  it('rejeita (403) pedido de cliente com telefone bloqueado, quando o bloqueio está ligado', async () => {
    const { orderRepository, blockedCustomerRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: true })) },
      blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
    });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(blockedCustomerRepository.isBlocked).toHaveBeenCalledWith('r-1', '5585984224877');
  });

  it('permite pedido de cliente bloqueado se o bloqueio estiver desligado no restaurante', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: false })) },
      blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(true) },
    });

    await runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() });

    expect(orderRepository.create).toHaveBeenCalled();
  });

  it('permite pedido de cliente não bloqueado, com o bloqueio ligado', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ customerBlockingEnabled: true })) },
      blockedCustomerRepository: { isBlocked: jest.fn().mockResolvedValue(false) },
    });

    await runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() });

    expect(orderRepository.create).toHaveBeenCalled();
  });

  // specs/0055-checkout-revalida-restaurante-aberto (reabre 0046/0033-REQ-7) — nunca confia só no
  // client achar que a loja está aberta (a tela de checkout pode ter aberto antes de fechar).
  it('AC-1 (specs/0055): POST /orders rejeita (409) quando o restaurante está fechado manualmente', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })) },
    });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('specs/0013 REQ-1: POST /orders dispara o recibo por WhatsApp (fire-and-forget) após criar o pedido', async () => {
    const { whatsAppNotificationService, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody(), user: { uid: 'customer-1' } },
      { json: jest.fn() },
    );
    // fire-and-forget: dá um tick pra Promise não aguardada resolver antes de checar a chamada.
    await Promise.resolve();

    expect(whatsAppNotificationService.sendOrderReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o-1' }),
      undefined,
    );
  });

  it('specs/0013 REQ-4: falha no envio do recibo não impede a resposta 201 de POST /orders', async () => {
    const { whatsAppNotificationService, routes } = setup();
    (whatsAppNotificationService.sendOrderReceipt as jest.Mock).mockRejectedValue(new Error('sessão caiu'));
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody(), user: { uid: 'customer-1' } },
      { json },
    );
    await Promise.resolve();

    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1' }));
  });

  it('Retirada (pickup): taxa de entrega é zero mesmo com Restaurant.deliveryFeeCents > 0', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ orderType: 'pickup', deliveryAddress: undefined }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryFee: 0, total: 25 }));
  });

  // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1.
  it('deliveryFeeMode "free": taxa de entrega é zero mesmo com Restaurant.deliveryFeeCents > 0', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ deliveryFeeMode: 'free', deliveryFeeCents: 500 })) },
    });

    await runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() });

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryFee: 0, total: 25 }));
  });

  // Taxa por bairro: quem define a taxa é a zona do bairro do endereço escolhido, nunca o valor fixo.
  it('taxa por bairro: cobra a taxa da zona do bairro informado', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({
            deliveryFeeMode: 'byNeighborhood',
            deliveryFeeCents: 5,
            deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Presidente Kennedy', feeCents: 800 }],
          }),
        ),
      },
    });

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ deliveryNeighborhood: 'presidente kennedy' }), user: { uid: 'customer-1' } },
      { json: jest.fn() },
    );

    // Zona de 800 centavos = R$ 8,00; subtotal 25 + taxa 8 = 33.
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryFee: 8, total: 33 }));
  });

  it('taxa por bairro: bairro sem zona cadastrada não fecha o pedido (400)', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ deliveryFeeMode: 'byNeighborhood', deliveryFeeZones: [] })) },
    });

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ deliveryNeighborhood: 'Aldeota' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  // specs/0083-modalidade-entrega-retirada-restaurante REQ-5/AC-4.
  it('specs/0083: rejeita (400) pedido de retirada num restaurante que só aceita entrega', async () => {
    const { orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ orderTypes: ['delivery'] })) },
    });

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ orderType: 'pickup', deliveryAddress: undefined }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita Delivery sem deliveryAddress', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ deliveryAddress: undefined }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Cartão é pago na maquina do estabelecimento: a operadora não é mais obrigatória.
  it('aceita Cartão de Crédito sem cardBrand (pagamento na maquina)', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ paymentMethod: 'creditCard' }), user: { uid: 'customer-1' } },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledTimes(1);
  });

  it('aceita Cartão de Crédito com cardBrand informado', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ paymentMethod: 'creditCard', cardBrand: 'Visa' }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cardBrand: 'Visa' }));
  });

  // specs/0080-troco-pagamento-dinheiro-checkout
  describe('specs/0080-troco-pagamento-dinheiro-checkout', () => {
    it('AC-2: POST /orders com cashChangeFor preenchido repassa o valor pro repositório', async () => {
      const { orderRepository, routes } = setup();

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'cash', cashChangeFor: '50' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cashChangeFor: 50 }));
    });

    it('AC-3: POST /orders sem cashChangeFor não envia o campo (não é obrigatório)', async () => {
      const { orderRepository, routes } = setup();

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'cash' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cashChangeFor: undefined }));
    });
  });

  it('lança 404 quando o restaurante não existe', async () => {
    const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /orders lista os pedidos do próprio cliente', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders'], { user: { uid: 'customer-1' } }, { json });

    expect(orderRepository.findManyByCustomer).toHaveBeenCalledWith('customer-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-1' })]);
  });

  it('AC-2: GET /orders/:id retorna o detalhe de um pedido do próprio cliente', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'o-1' }));
  });

  it('GET /orders/:id lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['GET /orders/:id'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0062-confirmar-pedido-whatsapp-restaurante REQ-5/REQ-6.
  describe('GET /orders/:id/whatsapp-confirmation-message', () => {
    it('AC-4: devolve o texto pronto e o telefone do restaurante', async () => {
      const { routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['GET /orders/:id/whatsapp-confirmation-message'],
        { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
        { json },
      );

      expect(json).toHaveBeenCalledWith(200, {
        text: expect.stringContaining('Pedido #1') as string,
        restaurantPhone: '11912345678',
      });
    });

    it('lança 404 quando notifyRestaurantOnNewOrder está desligado', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ notifyRestaurantOnNewOrder: false })) } });

      await expect(
        runAuthenticatedChain(
          routes['GET /orders/:id/whatsapp-confirmation-message'],
          { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lança 404 quando o restaurante não tem telefone cadastrado', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ phone: undefined })) } });

      await expect(
        runAuthenticatedChain(
          routes['GET /orders/:id/whatsapp-confirmation-message'],
          { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lança 404 quando o pedido é de outro cliente', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['GET /orders/:id/whatsapp-confirmation-message'],
          { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('usa o template customizado do restaurante quando presente, senão o default', async () => {
      const { routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ newOrderRestaurantWhatsAppTemplate: 'Pedido #{numeroPedido} confirmado, {nomeCliente}!' })) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['GET /orders/:id/whatsapp-confirmation-message'],
        { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
        { json },
      );

      expect(json).toHaveBeenCalledWith(200, { text: 'Pedido #1 confirmado, Ana!', restaurantPhone: '11912345678' });
    });
  });

  it('AC-6: PATCH /orders/:id/cancel cancela um pedido aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PATCH /orders/:id/cancel'],
      { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'cancelado', 'customer-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'cancelado' }));
  });

  it('AC-6: PATCH /orders/:id/cancel rejeita quando o pedido não está mais aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'confirmado' })) },
    });

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /orders/:id/cancel lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-8: GET /orders/track/:token é público e devolve só o necessário pra tela', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'token-1' } }, { json });

    expect(orderRepository.findByTrackingToken).toHaveBeenCalledWith('token-1');
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ orderNumber: 1, status: 'aguardandoConfirmacao' });
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('restaurantId');
    expect(payload).not.toHaveProperty('deliveryAddress');
  });

  // Pedido explícito do usuário (follow-up) — a página pública de acompanhamento passa a mostrar
  // a observação do pedido (não identifica o cliente, diferente de `deliveryAddress`/`customerId`).
  it('GET /orders/track/:token inclui a observação do pedido (notes)', async () => {
    const { routes } = setup({ orderRepository: { findByTrackingToken: jest.fn().mockResolvedValue(buildOrder({ notes: 'Sem cebola' })) } });
    const json = jest.fn();

    await runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'token-1' } }, { json });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ notes: 'Sem cebola' });
  });

  it('GET /orders/track/:token lança 404 quando o token não existe', async () => {
    const { routes } = setup({ orderRepository: { findByTrackingToken: jest.fn().mockResolvedValue(null) } });

    await expect(
      runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /restaurants/me/orders lista os pedidos em andamento do restaurante do operador (token, não da rota)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/orders'], { restaurantId: 'r-1' }, { json });

    expect(orderRepository.findActiveByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-1' })]);
  });

  // specs/0156-filtro-idade-impressao-automatica REQ-3.
  it('specs/0156 AC-4: GET /restaurants/me/orders inclui autoPrintMissed certo por pedido', async () => {
    const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
    const confirmedAt = (changedAt: string) => ({ status: 'confirmado', changedAt });
    const orders = [
      buildOrder({ id: 'o-missed', status: 'confirmado', statusHistory: [confirmedAt(tooOld)] }),
      buildOrder({ id: 'o-fresh', status: 'confirmado', statusHistory: [confirmedAt(new Date().toISOString())] }),
      // specs/0164 — pedido velho mas ainda não confirmado não é "perdido": ainda nem era elegível.
      buildOrder({ id: 'o-unconfirmed', createdAt: tooOld }),
      buildOrder({ id: 'o-already-printed', status: 'confirmado', statusHistory: [confirmedAt(tooOld)], autoPrintStatus: 'printed' }),
      buildOrder({ id: 'o-cancelled', status: 'cancelado', statusHistory: [confirmedAt(tooOld)] }),
    ];
    const { routes } = setup({ orderRepository: { findActiveByRestaurant: jest.fn().mockResolvedValue(orders) } });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/orders'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, [
      expect.objectContaining({ id: 'o-missed', autoPrintMissed: true }),
      expect.objectContaining({ id: 'o-fresh', autoPrintMissed: false }),
      expect.objectContaining({ id: 'o-unconfirmed', autoPrintMissed: false }),
      expect.objectContaining({ id: 'o-already-printed', autoPrintMissed: false }),
      expect.objectContaining({ id: 'o-cancelled', autoPrintMissed: false }),
    ]);
  });

  it('specs/0066 AC-4: GET /restaurants/me/orders inclui customer { name, phone } de cada pedido', async () => {
    const { routes } = setup({
      customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Michelle', email: 'm@exemplo.com', phone: '85984224877' }) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/orders'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, [
      expect.objectContaining({ id: 'o-1', customer: { name: 'Michelle', phone: '85984224877' } }),
    ]);
  });

  it('specs/0126 AC-1: GET /restaurants/me/orders/map retorna todos os status no intervalo do restaurante', async () => {
    const orders = [buildOrder({ id: 'o-delivered', status: 'entregue' }), buildOrder({ id: 'o-cancelled', status: 'cancelado' })];
    const { orderRepository, routes } = setup({ orderRepository: { findByRestaurantBetween: jest.fn().mockResolvedValue(orders) } });
    const json = jest.fn();
    const from = '2026-10-10T07:00:00.000Z';
    const to = '2026-10-11T07:00:00.000Z';

    await runOperatorChain(
      routes['GET /restaurants/me/orders/map'],
      { restaurantId: 'r-1', query: { from, to } },
      { json },
    );

    expect(orderRepository.findByRestaurantBetween).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
    expect(json).toHaveBeenCalledWith(200, expect.arrayContaining([
      expect.objectContaining({ id: 'o-delivered', status: 'entregue', autoPrintMissed: false }),
      expect.objectContaining({ id: 'o-cancelled', status: 'cancelado', autoPrintMissed: false }),
    ]));
  });

  // specs/0156-filtro-idade-impressao-automatica REQ-3.
  it('specs/0156 AC-4: GET /restaurants/me/orders/map inclui autoPrintMissed: true num pedido velho e nunca impresso', async () => {
    const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
    const orders = [buildOrder({ id: 'o-missed', status: 'confirmado', statusHistory: [{ status: 'confirmado', changedAt: tooOld }] })];
    const { routes } = setup({ orderRepository: { findByRestaurantBetween: jest.fn().mockResolvedValue(orders) } });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/orders/map'],
      { restaurantId: 'r-1', query: { from: '2026-10-10T07:00:00.000Z', to: '2026-10-11T07:00:00.000Z' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-missed', autoPrintMissed: true })]);
  });

  it('specs/0126: GET /restaurants/me/orders/map rejeita intervalo inválido', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/orders/map'],
        { restaurantId: 'r-1', query: { from: 'hoje', to: 'amanhã' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('specs/0137 AC-6: atribui snapshot de operador motoboy ativo ao pedido de entrega em preparo (email como nome, sem campo name em RestaurantOperator)', async () => {
    const motoboyOperator = { id: 'm-1', restaurantId: 'r-1', email: 'carlos@exemplo.com', role: 'motoboy' as const, isActive: true, createdAt: new Date() };
    const { orderRepository, restaurantOperatorRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'emPreparo' })) },
      restaurantOperatorRepository: { findById: jest.fn().mockResolvedValue(motoboyOperator) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/delivery-motoboy'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { motoboyId: 'm-1' } },
      { json },
    );

    expect(restaurantOperatorRepository.findById).toHaveBeenCalledWith('m-1');
    expect(orderRepository.assignDeliveryMotoboy).toHaveBeenCalledWith('o-1', { id: 'm-1', name: 'carlos@exemplo.com' });
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ deliveryMotoboy: { id: 'm-1', name: 'carlos@exemplo.com' } }));
  });

  it.each([
    ['inativo', { id: 'm-1', restaurantId: 'r-1', email: 'carlos@exemplo.com', role: 'motoboy' as const, isActive: false, createdAt: new Date() }],
    ['de outro restaurante', { id: 'm-1', restaurantId: 'r-2', email: 'carlos@exemplo.com', role: 'motoboy' as const, isActive: true, createdAt: new Date() }],
    ['com papel diferente de motoboy', { id: 'm-1', restaurantId: 'r-1', email: 'carlos@exemplo.com', role: 'gerente' as const, isActive: true, createdAt: new Date() }],
  ])('specs/0137 AC-6: rejeita operador motoboy %s', async (_description, operator) => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'emPreparo' })) },
      restaurantOperatorRepository: { findById: jest.fn().mockResolvedValue(operator) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/delivery-motoboy'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { motoboyId: 'm-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.assignDeliveryMotoboy).not.toHaveBeenCalled();
  });

  it('specs/0125 AC-4: limpar a atribuição não exige motoboy nem muda o status', async () => {
    const { orderRepository, restaurantOperatorRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'emPreparo' })) },
    });

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/delivery-motoboy'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { motoboyId: null } },
      { json: jest.fn() },
    );

    expect(restaurantOperatorRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.assignDeliveryMotoboy).toHaveBeenCalledWith('o-1', undefined);
  });

  it.each([
    ['fora de preparo', { status: 'confirmado' }],
    ['de retirada', { status: 'emPreparo', orderType: 'pickup' }],
  ])('specs/0125: não permite atribuir motoboy a pedido %s', async (_description, orderOverrides) => {
    const { orderRepository, restaurantOperatorRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder(orderOverrides)) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/delivery-motoboy'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { motoboyId: 'm-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(restaurantOperatorRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.assignDeliveryMotoboy).not.toHaveBeenCalled();
  });

  it('specs/0137 AC-3: GET /restaurants/me/orders/my-deliveries filtra pelas entregas do motoboy logado', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/orders/my-deliveries'],
      { restaurantId: 'r-1', operatorRole: 'motoboy', operatorId: 'op-motoboy-1' },
      { json },
    );

    expect(orderRepository.findActiveByRestaurantAndMotoboy).toHaveBeenCalledWith('r-1', 'op-motoboy-1');
    expect(json).toHaveBeenCalledWith(200, expect.any(Array));
  });

  it('specs/0137 AC-3: motoboy marca pedido próprio como entregue via PATCH /status', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega', deliveryMotoboy: { id: 'op-motoboy-1', name: 'carlos@exemplo.com' } })) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', operatorRole: 'motoboy', operatorId: 'op-motoboy-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'entregue', 'r-1');
    expect(json).toHaveBeenCalledWith(200, expect.anything());
  });

  it('specs/0137 REQ-4: motoboy não pode alterar status de pedido atribuído a outro motoboy (403)', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega', deliveryMotoboy: { id: 'outro-motoboy', name: 'outro@exemplo.com' } })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', operatorRole: 'motoboy', operatorId: 'op-motoboy-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('specs/0137 REQ-3: motoboy não pode mudar status pra algo diferente de entregue, mesmo no próprio pedido (403)', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega', deliveryMotoboy: { id: 'op-motoboy-1', name: 'carlos@exemplo.com' } })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', operatorRole: 'motoboy', operatorId: 'op-motoboy-1', params: { id: 'o-1' }, body: { status: 'cancelado' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('AC-2: PATCH /restaurants/me/orders/:id/status avança um passo (aguardandoConfirmacao -> confirmado)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'confirmado', 'r-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'confirmado' }));
  });

  it('specs/0013 REQ-2: PATCH .../status dispara o aviso de mudança de status por WhatsApp', async () => {
    const { whatsAppNotificationService, routes } = setup();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json: jest.fn() },
    );
    await Promise.resolve();

    expect(whatsAppNotificationService.sendOrderStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmado' }),
    );
  });

  it('specs/0014-financeiro REQ-5: PATCH .../status pra "entregue" chama CashRegisterService com os dados do pedido', async () => {
    const { cashRegisterService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega', paymentMethod: 'pix' })),
        updateStatus: jest.fn().mockResolvedValue(buildOrder({ status: 'entregue', paymentMethod: 'pix' })),
      },
    });

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
      { json: jest.fn() },
    );

    expect(cashRegisterService.addAutomaticEntry).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      orderId: 'o-1',
      orderNumber: 1,
      amount: 30,
      paymentMethod: 'pix',
    });
  });

  it('specs/0014-financeiro REQ-5: PATCH .../status pra um status que não é "entregue" nunca chama CashRegisterService', async () => {
    const { cashRegisterService, routes } = setup();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
      { json: jest.fn() },
    );

    expect(cashRegisterService.addAutomaticEntry).not.toHaveBeenCalled();
  });

  it('specs/0014-financeiro REQ-5: falha no lançamento automático de caixa não impede a resposta 200 da mudança de status', async () => {
    const { cashRegisterService, routes } = setup({
      orderRepository: {
        findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega' })),
      },
    });
    (cashRegisterService.addAutomaticEntry as jest.Mock).mockRejectedValue(new Error('sessão de caixa indisponível'));
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/status'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'entregue' }));
  });

  it('AC-5: PATCH /restaurants/me/orders/:id/status bloqueia pular de aguardandoConfirmacao direto pra entregue', async () => {
    const { orderRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'entregue' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /restaurants/me/orders/:id/status lança 404 quando o pedido é de outro restaurante', async () => {
    const { routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/status'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { status: 'confirmado' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-3: PATCH /restaurants/me/orders/:id/cancel exige motivo e registra na linha do tempo', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/cancel'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { reason: 'Cliente desistiu' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'cancelado', 'r-1', 'Cliente desistiu');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'cancelado' }));
  });

  it('specs/0120 REQ-2: cancelar pedido de mesa libera a mesa vinculada', async () => {
    const { tableRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ orderType: 'table', tableId: 't-1' })) },
    });

    await runOperatorChain(
      routes['PATCH /restaurants/me/orders/:id/cancel'],
      { restaurantId: 'r-1', params: { id: 'o-1' }, body: { reason: 'Pedido duplicado' } },
      { json: jest.fn() },
    );

    expect(tableRepository.releaseFromOrder).toHaveBeenCalledWith('t-1', 'r-1', 'o-1');
  });

  it('PATCH /restaurants/me/orders/:id/cancel rejeita corpo sem motivo', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/cancel'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: {} },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('PATCH /restaurants/me/orders/:id/cancel rejeita quando o pedido já saiu para entrega', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'saiuParaEntrega' })) },
    });

    await expect(
      runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/cancel'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { reason: 'Cliente desistiu' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('AC-4: GET /restaurants/me/sales-summary devolve o agregado do período, escopado ao restaurante do operador', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/sales-summary'],
      { restaurantId: 'r-1', query: { from: '2026-09-01', to: '2026-09-30' } },
      { json },
    );

    expect(orderRepository.getSalesSummary).toHaveBeenCalledWith('r-1', new Date('2026-09-01'), new Date('2026-09-30'));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ totalOrders: 10, totalRevenue: 300, tableRevenue: 90, cancelledOrders: 1 }));
  });

  it('GET /restaurants/me/sales-summary rejeita datas inválidas', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/sales-summary'],
        { restaurantId: 'r-1', query: { from: 'não-é-uma-data', to: '2026-09-30' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('specs/0020-pix-no-app', () => {
    it('AC-2/T003: POST /orders rejeita (400) Pix quando o restaurante não tem chave Pix cadastrada', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant()) } });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('T003: POST /orders aceita Pix quando o restaurante tem chave Pix cadastrada', async () => {
      const { orderRepository, routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ pixKey: '11999999999' })) },
      });

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pix' }));
    });

    it('AC-1/T002: GET /orders/:id inclui o pixCode (copia-e-cola) quando paymentMethod é pix e o pagamento está pendente', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'pix', total: 30 })) },
        restaurantRepository: {
          findById: jest.fn().mockResolvedValue(
            buildRestaurant({ pixKey: '11999999999', pixBeneficiaryName: 'Prime Pizza LTDA', address: { city: 'São Paulo' } }),
          ),
        },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'pendente' })) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload.pixCode).toEqual(expect.any(String));
      expect(payload.pixCode).toContain('br.gov.bcb.pix');
      expect(payload).toMatchObject({ payment: { method: 'pix', status: 'pendente' } });
    });

    it('AC-3/REQ-5: GET /orders/:id não inclui pixCode quando o pagamento já foi confirmado (some da resposta, não só da tela)', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'pix' })) },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ pixKey: '11999999999' })) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload.pixCode).toBeUndefined();
      expect(payload).toMatchObject({ payment: { method: 'pix', status: 'aprovado' } });
    });

    it('GET /orders/:id não inclui pixCode pra outros métodos de pagamento', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'cash' })) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'cash', status: 'pendente' })) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload.pixCode).toBeUndefined();
    });

    it('T006: GET /restaurants/me/orders inclui payment.status em cada pedido', async () => {
      const { routes } = setup({
        orderRepository: {
          findActiveByRestaurant: jest.fn().mockResolvedValue([buildOrder({ id: 'o-1', paymentMethod: 'pix' }), buildOrder({ id: 'o-2', paymentMethod: 'cash' })]),
        },
        paymentRepository: {
          findManyByOrderIds: jest.fn().mockResolvedValue([
            buildPayment({ id: 'pay-1', orderId: 'o-1', method: 'pix', status: 'pendente' }),
            buildPayment({ id: 'pay-2', orderId: 'o-2', method: 'cash', status: 'aprovado' }),
          ]),
        },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/orders'], { restaurantId: 'r-1' }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>[]];
      expect(payload).toEqual([
        expect.objectContaining({ id: 'o-1', payment: { method: 'pix', status: 'pendente' } }),
        expect.objectContaining({ id: 'o-2', payment: { method: 'cash', status: 'aprovado' } }),
      ]);
    });

    it('AC-3/T005: PATCH .../payment/confirm marca o Payment como aprovado', async () => {
      const { paymentRepository, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json },
      );

      expect(paymentRepository.markAsApproved).toHaveBeenCalledWith('o-1');
      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload).toMatchObject({ payment: { status: 'aprovado' } });
    });

    it('specs/0064 AC-2: PATCH .../payment/confirm dispara a mensagem de Pix confirmado por WhatsApp', async () => {
      const { whatsAppNotificationService, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
      });

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json: jest.fn() },
      );

      expect(whatsAppNotificationService.sendPaymentConfirmedMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-1' }));
    });

    it('specs/0064 AC-3: falha no envio do WhatsApp não afeta a confirmação (200 mesmo assim)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { whatsAppNotificationService, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
      });
      (whatsAppNotificationService.sendPaymentConfirmedMessage as jest.Mock).mockRejectedValue(new Error('sem conexão'));
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json },
      );

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: expect.objectContaining({ status: 'aprovado' }) }));
    });

    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-4/AC-3 (finalmente REQ-1a de specs/0140).
    it('specs/0151 AC-3: "pix" em autoConfirmPaymentMethods avança Order.status pra confirmado na mesma chamada', async () => {
      const { orderRepository, whatsAppNotificationService, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoConfirmPaymentMethods: ['pix'] })) },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json },
      );

      expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'confirmado', 'r-1');
      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload).toMatchObject({ status: 'confirmado', payment: { status: 'aprovado' } });
      expect(whatsAppNotificationService.sendOrderStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-1', status: 'confirmado' }));
    });

    it('specs/0151 AC-4: sem "pix" em autoConfirmPaymentMethods, confirmar o Pix só aprova o pagamento (sem mudança)', async () => {
      const { orderRepository, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json },
      );

      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload).toMatchObject({ status: 'aguardandoConfirmacao', payment: { status: 'aprovado' } });
    });

    it('specs/0151: pedido já confirmado antes do Pix ser aprovado não chama updateStatus de novo', async () => {
      const { orderRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'confirmado' })) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'pendente' })) },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoConfirmPaymentMethods: ['pix'] })) },
      });

      await runOperatorChain(
        routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
        { restaurantId: 'r-1', params: { id: 'o-1' } },
        { json: jest.fn() },
      );

      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('T005: PATCH .../payment/confirm rejeita (409) quando o pagamento já foi confirmado', async () => {
      const { paymentRepository, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix', status: 'aprovado' })) },
      });

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
          { restaurantId: 'r-1', params: { id: 'o-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    });

    it('T005: PATCH .../payment/confirm rejeita (409) quando o método de pagamento não é pix', async () => {
      const { paymentRepository, routes } = setup({
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'cash', status: 'pendente' })) },
      });

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
          { restaurantId: 'r-1', params: { id: 'o-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    });

    it('PATCH .../payment/confirm lança 404 quando o pedido é de outro restaurante', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) },
      });

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/orders/:id/payment/confirm'],
          { restaurantId: 'r-1', params: { id: 'o-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('specs/0022-cupons-desconto', () => {
    it('AC-2: POST /orders sem couponCode não mexe no cupom nem aplica desconto', async () => {
      const { orderRepository, couponRepository, routes } = setup();

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody(), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(couponRepository.findByCode).not.toHaveBeenCalled();
      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ discount: 0, couponCode: undefined }));
    });

    it('AC-2: POST /orders com couponCode válido revalida no servidor, aplica o desconto no total e incrementa o uso', async () => {
      const { orderRepository, couponRepository, routes } = setup({
        couponRepository: {
          findByCode: jest.fn().mockResolvedValue(buildCoupon({ discountType: 'percentual', discountValue: 10 })),
          incrementUsageIfWithinLimit: jest.fn().mockResolvedValue(buildCoupon({ usageCount: 1 })),
        },
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ couponCode: 'promo10' }), user: { uid: 'customer-1' } },
        { json },
      );

      expect(couponRepository.findByCode).toHaveBeenCalledWith('r-1', 'PROMO10');
      expect(couponRepository.incrementUsageIfWithinLimit).toHaveBeenCalledWith('c-1');
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ subtotal: 25, discount: 2.5, total: 27.5, couponCode: 'PROMO10' }),
      );
      expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1' }));
    });

    it('AC-3: POST /orders rejeita (400) um couponCode inexistente, sem criar o pedido nem incrementar uso', async () => {
      const { orderRepository, couponRepository, routes } = setup({
        couponRepository: { findByCode: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ couponCode: 'INEXISTENTE' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Cupom não encontrado' });
      expect(orderRepository.create).not.toHaveBeenCalled();
      expect(couponRepository.incrementUsageIfWithinLimit).not.toHaveBeenCalled();
    });

    it('AC-3: POST /orders rejeita (400) um couponCode expirado', async () => {
      const { orderRepository, routes } = setup({
        couponRepository: {
          findByCode: jest.fn().mockResolvedValue(buildCoupon({ validUntil: '2020-01-01T00:00:00.000Z' })),
        },
      });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ couponCode: 'promo10' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Cupom expirado' });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('AC-4/T012: POST /orders rejeita (409) quando o compare-and-swap do limite de uso falha (concorrência: outro pedido levou o último uso disponível)', async () => {
      const { orderRepository, routes } = setup({
        couponRepository: {
          findByCode: jest.fn().mockResolvedValue(buildCoupon({ usageLimit: 1, usageCount: 0 })),
          // Simula a corrida: entre a leitura (usageCount: 0, passa na checagem não atômica) e o
          // incremento de fato, outra requisição concorrente já consumiu o último uso disponível
          // — `findOneAndUpdate` (CAS) devolve `null`, mesmo padrão de
          // `ReceivePurchaseOrderService`/specs/0015.
          incrementUsageIfWithinLimit: jest.fn().mockResolvedValue(null),
        },
      });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ couponCode: 'promo10' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('AC-4: POST /orders rejeita (400) quando o limite total já está esgotado no próprio dado lido (sem precisar do CAS)', async () => {
      const { orderRepository, couponRepository, routes } = setup({
        couponRepository: { findByCode: jest.fn().mockResolvedValue(buildCoupon({ usageLimit: 1, usageCount: 1 })) },
      });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ couponCode: 'promo10' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Cupom atingiu o limite de uso' });
      expect(orderRepository.create).not.toHaveBeenCalled();
      expect(couponRepository.incrementUsageIfWithinLimit).not.toHaveBeenCalled();
    });

    it('AC-6: POST /orders rejeita (400) quando o cliente já usou o cupom o máximo de vezes permitido por cliente, mesmo com limite total disponível', async () => {
      const { orderRepository, routes } = setup({
        couponRepository: {
          findByCode: jest.fn().mockResolvedValue(buildCoupon({ usageLimit: 100, usageCount: 1, usageLimitPerCustomer: 1 })),
        },
        orderRepository: { countByCustomerAndCoupon: jest.fn().mockResolvedValue(1) },
      });

      await expect(
        runAuthenticatedChain(
          routes['POST /orders'],
          { body: buildValidBody({ couponCode: 'promo10' }), user: { uid: 'customer-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Você já usou esse cupom o número máximo de vezes permitido' });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('desconto de valor fixo maior que o subtotal nunca deixa o total negativo', async () => {
      const { orderRepository, routes } = setup({
        couponRepository: {
          findByCode: jest.fn().mockResolvedValue(buildCoupon({ discountType: 'fixo', discountValue: 999 })),
        },
      });

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ couponCode: 'promo10', items: [buildItem({ unitPrice: 25, quantity: 1 })] }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ discount: 25, total: 5 }));
    });
  });

  describe('specs/0101-integracao-asaas (fase 1)', () => {
    const MockedAsaasClient = AsaasClient as jest.MockedClass<typeof AsaasClient>;

    beforeEach(() => {
      MockedAsaasClient.mockClear();
      MockedAsaasClient.prototype.createCustomer = jest.fn().mockResolvedValue({ id: 'cus_1' });
      MockedAsaasClient.prototype.createPixCharge = jest.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING' });
      MockedAsaasClient.prototype.getPixQrCode = jest.fn().mockResolvedValue({ payload: '00020126...copia-e-cola-asaas' });
      MockedAsaasClient.prototype.refundCharge = jest.fn().mockResolvedValue(undefined);
    });

    it('POST /orders: restaurante com Asaas habilitado e cliente com CPF cria a cobrança real e persiste no Payment', async () => {
      const { paymentRepository, routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ onlinePaymentsEnabled: true, asaasApiKey: 'key-subconta' })) },
        customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana', email: 'ana@exemplo.com', phone: '85984224877', document: '12345678900' }) },
      });

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(MockedAsaasClient.prototype.createCustomer).toHaveBeenCalledWith('Ana', '12345678900');
      expect(MockedAsaasClient.prototype.createPixCharge).toHaveBeenCalledWith('cus_1', expect.any(Number), expect.any(String), 'o-1');
      expect(paymentRepository.setAsaasPixDetails).toHaveBeenCalledWith('o-1', { externalReference: 'pay_1', pixPayload: '00020126...copia-e-cola-asaas' });
    });

    it('POST /orders: restaurante sem Asaas habilitado nunca chama o AsaasClient', async () => {
      const { paymentRepository, routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ pixKey: '11999999999' })) },
      });

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(MockedAsaasClient.prototype.createCustomer).not.toHaveBeenCalled();
      expect(paymentRepository.setAsaasPixDetails).not.toHaveBeenCalled();
    });

    it('POST /orders: cliente sem CPF/CNPJ cai no fallback do Pix local, sem chamar o Asaas', async () => {
      const { paymentRepository, routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ onlinePaymentsEnabled: true, asaasApiKey: 'key-subconta', pixKey: '11999999999' })) },
        customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana', email: 'ana@exemplo.com', phone: '85984224877' }) },
      });

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      );

      expect(MockedAsaasClient.prototype.createCustomer).not.toHaveBeenCalled();
      expect(paymentRepository.setAsaasPixDetails).not.toHaveBeenCalled();
    });

    it('POST /orders: falha do Asaas (rede/API) cai no fallback do Pix local, sem derrubar a criação do pedido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      MockedAsaasClient.prototype.createCustomer = jest.fn().mockRejectedValue(new Error('Asaas API respondeu 500'));
      const { paymentRepository, routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ onlinePaymentsEnabled: true, asaasApiKey: 'key-subconta', pixKey: '11999999999' })) },
        customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana', email: 'ana@exemplo.com', phone: '85984224877', document: '12345678900' }) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'pix' }), user: { uid: 'customer-1' } },
        { json },
      );

      expect(paymentRepository.setAsaasPixDetails).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1' }));
    });

    it('GET /orders/:id prefere o pixPayload persistido (Asaas) sobre o BR Code local', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'pix' })) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ pixPayload: '00020126...copia-e-cola-asaas' })) },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ pixKey: '11999999999' })) },
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ pixCode: '00020126...copia-e-cola-asaas' }));
    });

    it('PATCH /orders/:id/cancel: Pix Asaas já aprovado dispara estorno e marca o Payment como estornado', async () => {
      const { paymentRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'pix' })) },
        paymentRepository: {
          findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado', externalReference: 'pay_1' })),
          markAsRefunded: jest.fn().mockResolvedValue(buildPayment({ status: 'estornado' })),
        },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ onlinePaymentsEnabled: true, asaasApiKey: 'key-subconta' })) },
      });

      await runAuthenticatedChain(routes['PATCH /orders/:id/cancel'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json: jest.fn() });

      expect(MockedAsaasClient.prototype.refundCharge).toHaveBeenCalledWith('pay_1');
      expect(paymentRepository.markAsRefunded).toHaveBeenCalledWith('o-1');
    });

    it('PATCH /orders/:id/cancel: Pix ainda pendente (nunca pago) não tenta estornar', async () => {
      const { paymentRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ paymentMethod: 'pix' })) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'pendente' })) },
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ onlinePaymentsEnabled: true, asaasApiKey: 'key-subconta' })) },
      });

      await runAuthenticatedChain(routes['PATCH /orders/:id/cancel'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json: jest.fn() });

      expect(MockedAsaasClient.prototype.refundCharge).not.toHaveBeenCalled();
      expect(paymentRepository.markAsRefunded).not.toHaveBeenCalled();
    });
  });
});
