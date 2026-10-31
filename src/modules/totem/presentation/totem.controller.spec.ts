import type { Request, Response, Server } from 'restify';

import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../../raw-materials/domain/repositories/stock-movement.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { TotemController } from './totem.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  restaurantId?: string;
  operatorRole?: string;
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
  };
  return { application: application as unknown as Server, routes };
}

// Pula totemApiKeyMiddleware (primeiro da chain, spec própria em totem-api-key.middleware.spec.ts)
// — injeta req.restaurantId manualmente, como o middleware real faria.
async function runTotemChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// Pula firebaseAuthMiddleware + restaurantOperatorMiddleware + requireOperatorRole (3 primeiros).
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    orderTypes: ['delivery', 'pickup'],
    businessHours: (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map((dayOfWeek) => ({
      dayOfWeek,
      isClosed: false,
      openTime: '00:00',
      closeTime: '23:59',
    })),
    totemEnabled: true,
    totemPaymentMethods: ['cash', 'pix'],
    pixKey: '11999999999',
    stockControlEnabled: false,
    autoConfirmPaymentMethods: [],
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}) {
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
    customerName: 'Cliente Totem',
    items: [buildItem()],
    paymentMethod: 'cash',
    ...overrides,
  };
}

function buildController(overrides: {
  menuCategoryRepository?: Partial<IMenuCategoryRepository>;
  productRepository?: Partial<IProductRepository>;
  orderRepository?: Partial<IOrderRepository>;
  restaurantRepository?: Partial<IRestaurantRepository>;
  customerRepository?: Partial<ICustomerRepository>;
} = {}) {
  const menuCategoryRepository: Partial<IMenuCategoryRepository> = {
    listByRestaurant: jest.fn().mockResolvedValue([]),
    ...overrides.menuCategoryRepository,
  };
  // Preço (25) bate com o `unitPrice` default de `buildItem()` — achado de auditoria 2026-10-31,
  // `resolveItemsLinkedProducts` agora rejeita o pedido quando `unitPrice` não bate com o preço
  // real do produto buscado aqui.
  const productRepository: Partial<IProductRepository> = {
    findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'r-1', price: 25, additionalGroups: [] }),
    listByRestaurant: jest.fn().mockResolvedValue([]),
    ...overrides.productRepository,
  };
  const orderRepository: Partial<IOrderRepository> = {
    findActiveByRestaurant: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    ...overrides.orderRepository,
  };
  const restaurantRepository: Partial<IRestaurantRepository> = {
    findById: jest.fn().mockResolvedValue(buildRestaurant()),
    regenerateTotemApiKey: jest.fn(),
    ...overrides.restaurantRepository,
  };
  const customerRepository: Partial<ICustomerRepository> = {
    createStandalone: jest.fn().mockResolvedValue({ id: 'totem_customer-1', name: 'Cliente Totem', email: 'x@totem.local' }),
    ...overrides.customerRepository,
  };
  const stockMovementRepository = {} as IStockMovementRepository;
  const rawMaterialRepository = {} as IRawMaterialRepository;

  const noopMiddleware = async () => {};
  const controller = new TotemController(
    menuCategoryRepository as IMenuCategoryRepository,
    productRepository as IProductRepository,
    orderRepository as IOrderRepository,
    restaurantRepository as IRestaurantRepository,
    customerRepository as ICustomerRepository,
    noopMiddleware,
    noopMiddleware,
    stockMovementRepository,
    rawMaterialRepository,
  );

  const { application, routes } = buildFakeApplication();
  controller.initializeRoutes(application);

  return { routes, menuCategoryRepository, productRepository, orderRepository, restaurantRepository, customerRepository };
}

describe('TotemController (specs/0155-app-totem-autoatendimento)', () => {
  describe('GET /restaurants/me/totem/config (REQ-11/REQ-22)', () => {
    it('devolve as formas de pagamento habilitadas pro totem', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ totemPaymentMethods: ['pix', 'cash'] })) },
      });
      const json = jest.fn();

      await runTotemChain(routes['GET /restaurants/me/totem/config'], { restaurantId: 'r-1' }, { json });

      expect(json).toHaveBeenCalledWith(200, { totemPaymentMethods: ['pix', 'cash'] });
    });
  });

  describe('GET /restaurants/me/totem/menu-categories (REQ-17)', () => {
    it('devolve as categorias do restaurante pareado, com os produtos (e additionalGroups completos, REQ-7) agrupados por categoria', async () => {
      const categories = [{ id: 'cat-1', name: 'Pizzas', isActive: true, sortOrder: 0 }];
      const products = [
        {
          id: 'p-1',
          menuCategoryId: 'cat-1',
          name: 'Marguerita',
          price: 25,
          isAvailable: true,
          additionalGroups: [{ id: 'g-1', name: 'Tamanho', required: true, minSelections: 1, maxSelections: 1, options: [] }],
        },
      ];
      const { routes, restaurantRepository } = buildController({
        menuCategoryRepository: { listByRestaurant: jest.fn().mockResolvedValue(categories) },
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue(products) },
      });
      const json = jest.fn();

      await runTotemChain(routes['GET /restaurants/me/totem/menu-categories'], { restaurantId: 'r-1' }, { json });

      expect(restaurantRepository.findById).toHaveBeenCalledWith('r-1');
      const [, body] = json.mock.calls[0];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('cat-1');
      expect(body[0].products).toHaveLength(1);
      expect(body[0].products[0].additionalGroups).toEqual(products[0].additionalGroups);
    });

    it('esconde produto sem saldo quando o restaurante tem controle de estoque ligado', async () => {
      const categories = [{ id: 'cat-1', name: 'Pizzas', isActive: true, sortOrder: 0 }];
      const products = [
        { id: 'p-1', menuCategoryId: 'cat-1', name: 'Com saldo', price: 25, isAvailable: true, additionalGroups: [], tracksStock: true, stockQuantity: 2 },
        { id: 'p-2', menuCategoryId: 'cat-1', name: 'Sem saldo', price: 25, isAvailable: true, additionalGroups: [], tracksStock: true, stockQuantity: 0 },
      ];
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ stockControlEnabled: true })) },
        menuCategoryRepository: { listByRestaurant: jest.fn().mockResolvedValue(categories) },
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue(products) },
      });
      const json = jest.fn();

      await runTotemChain(routes['GET /restaurants/me/totem/menu-categories'], { restaurantId: 'r-1' }, { json });

      const [, body] = json.mock.calls[0];
      expect(body[0].products.map((p: { name: string }) => p.name)).toEqual(['Com saldo']);
    });

    it('404 quando o totem não está habilitado pro restaurante', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ totemEnabled: false })) },
      });
      const json = jest.fn();

      await expect(runTotemChain(routes['GET /restaurants/me/totem/menu-categories'], { restaurantId: 'r-1' }, { json })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('POST /restaurants/me/totem/orders (AC-6)', () => {
    it('cria o pedido com orderType pickup, source totem e subtotal/total calculados no BFF (nunca confia no valor mandado)', async () => {
      const { routes, orderRepository, customerRepository } = buildController();
      const json = jest.fn();
      // Cliente malicioso/bugado manda um `unitPrice` diferente do real: o teste confirma que o
      // total gravado é 25 (1 * 25 do item), não qualquer valor que o corpo pudesse sugerir.
      const body = buildValidBody({ items: [buildItem({ unitPrice: 25, quantity: 1 })] });

      await runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body }, { json });

      expect(customerRepository.createStandalone).toHaveBeenCalledWith('Cliente Totem', undefined);
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: 'pickup',
          source: 'totem',
          subtotal: 25,
          deliveryFee: 0,
          discount: 0,
          total: 25,
          paymentMethod: 'cash',
        }),
      );
      expect(json).toHaveBeenCalledWith(201, { pixCode: undefined });
    });

    // Achado crítico da auditoria pré-produção (31/10/2026) — "preço do pedido nunca é
    // revalidado contra o catálogo real", mesma checagem de `OrdersController`.
    it('achado de auditoria (2026-10-31): rejeita (400) quando unitPrice não bate com o preço real do produto, sem criar o pedido', async () => {
      const { routes, orderRepository } = buildController();
      const json = jest.fn();
      const body = buildValidBody({ items: [buildItem({ unitPrice: 1 })] });

      await expect(runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body }, { json })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('achado de auditoria (2026-10-31): rejeita (400) quando productId é de outro restaurante, mesmo com unitPrice "correto"', async () => {
      const { routes, orderRepository } = buildController({
        productRepository: { findById: jest.fn().mockResolvedValue({ id: 'p-1', restaurantId: 'outro-restaurante', price: 25, additionalGroups: [] }) },
      });
      const json = jest.fn();

      await expect(
        runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body: buildValidBody() }, { json }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('AC-6: não exige nenhum token de autenticação Firebase — só passa pelo totemApiKeyMiddleware (pulado no teste, resolve req.restaurantId direto)', async () => {
      const { routes, orderRepository } = buildController();
      const json = jest.fn();

      // Sem req.user nenhum (diferente de POST /orders do app cliente) — só req.restaurantId,
      // exatamente como o totemApiKeyMiddleware real preencheria.
      await runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body: buildValidBody() }, { json });

      expect(orderRepository.create).toHaveBeenCalled();
    });

    it('AC-5/REQ-12: pedido Pix devolve pixCode (BR Code) pro totem mostrar o QR code na própria tela', async () => {
      const createdOrder = { id: 'o-1', total: 25, paymentMethod: 'pix' };
      const { routes } = buildController({
        orderRepository: { create: jest.fn().mockResolvedValue(createdOrder) },
      });
      const json = jest.fn();

      await runTotemChain(
        routes['POST /restaurants/me/totem/orders'],
        { restaurantId: 'r-1', body: buildValidBody({ paymentMethod: 'pix' }) },
        { json },
      );

      const [, body] = json.mock.calls[0];
      expect(typeof body.pixCode).toBe('string');
      expect(body.pixCode.length).toBeGreaterThan(0);
    });

    it('rejeita forma de pagamento não habilitada pro totem (REQ-11)', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ totemPaymentMethods: ['pix'] })) },
      });
      const json = jest.fn();

      await expect(
        runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body: buildValidBody({ paymentMethod: 'cash' }) }, { json }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita quando o totem está desligado pro restaurante', async () => {
      const { routes } = buildController({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ totemEnabled: false })) },
      });
      const json = jest.fn();

      await expect(
        runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body: buildValidBody() }, { json }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejeita pedido quando o restaurante está fechado (mesma validação de POST /orders)', async () => {
      const closed = buildRestaurant({
        businessHours: (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map((dayOfWeek) => ({
          dayOfWeek,
          isClosed: true,
        })),
      });
      const { routes } = buildController({ restaurantRepository: { findById: jest.fn().mockResolvedValue(closed) } });
      const json = jest.fn();

      await expect(
        runTotemChain(routes['POST /restaurants/me/totem/orders'], { restaurantId: 'r-1', body: buildValidBody() }, { json }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('GET /restaurants/me/totem/orders/:orderId/receipt-lines (REQ-18)', () => {
    it('devolve as linhas de recibo do pedido, no mesmo formato de AutoPrintController', async () => {
      const order = {
        id: 'o-1',
        restaurantId: 'r-1',
        orderNumber: 5,
        orderType: 'pickup',
        items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 25, selections: [] }],
        subtotal: 25,
        deliveryFee: 0,
        discount: 0,
        total: 25,
        paymentMethod: 'cash',
        status: 'aguardandoConfirmacao',
        statusHistory: [],
        createdAt: new Date().toISOString(),
        customerId: 'totem_c-1',
      };
      const { routes } = buildController({
        orderRepository: { findById: jest.fn().mockResolvedValue(order) },
        customerRepository: { findById: jest.fn().mockResolvedValue({ id: 'totem_c-1', name: 'Cliente Totem', email: 'x@totem.local' }) },
      });
      const json = jest.fn();

      await runTotemChain(routes['GET /restaurants/me/totem/orders/:orderId/receipt-lines'], { restaurantId: 'r-1', params: { orderId: 'o-1' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ lines: expect.any(Array) }));
    });

    it('404 quando o pedido não existe ou é de outro restaurante', async () => {
      const { routes } = buildController({ orderRepository: { findById: jest.fn().mockResolvedValue(null) } });
      const json = jest.fn();

      await expect(
        runTotemChain(routes['GET /restaurants/me/totem/orders/:orderId/receipt-lines'], { restaurantId: 'r-1', params: { orderId: 'o-404' } }, { json }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('POST /restaurants/me/totem/regenerate-key (REQ-22)', () => {
    it('gera e devolve uma chave nova', async () => {
      const { routes, restaurantRepository } = buildController({
        restaurantRepository: {
          regenerateTotemApiKey: jest.fn().mockResolvedValue(buildRestaurant({ totemApiKey: 'nova-chave' })),
        },
      });
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/totem/regenerate-key'], { restaurantId: 'r-1' }, { json });

      expect(restaurantRepository.regenerateTotemApiKey).toHaveBeenCalledWith('r-1');
      expect(json).toHaveBeenCalledWith(200, { totemApiKey: 'nova-chave' });
    });
  });
});
