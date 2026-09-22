import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { RestaurantSignupController } from './restaurant-signup.controller';

type FakeRequest = Partial<Pick<Request, 'body'>> & { user?: { email?: string } };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), put: register('PUT'), patch: register('PATCH'), post: register('POST'), del: register('DEL') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` (1º da chain, tem spec própria) — aqui o foco é o handler de
// negócio a partir do `req.user` já resolvido.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildRestaurantRepository(overrides: Partial<IRestaurantRepository> = {}): IRestaurantRepository {
  return {
    findBySlug: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Pizzaria do João', slug: 'pizzaria-do-joao' }),
    ...overrides,
  } as IRestaurantRepository;
}

function buildOperatorRepository(overrides: Partial<IRestaurantOperatorRepository> = {}): IRestaurantOperatorRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'op-1', restaurantId: 'r-1', email: 'joao@exemplo.com', role: 'dono', isActive: true, createdAt: new Date() }),
    ...overrides,
  } as IRestaurantOperatorRepository;
}

function buildMenuCategoryRepository(overrides: Partial<IMenuCategoryRepository> = {}): IMenuCategoryRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Pizzas', sortOrder: 0 }),
    ...overrides,
  } as IMenuCategoryRepository;
}

function buildProductRepository(overrides: Partial<IProductRepository> = {}): IProductRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'p-1' }),
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-12 — seedDefaultCatalog
    // chama update() pra vincular additionalGroups no produto especial de pizzaria.
    update: jest.fn().mockResolvedValue({ id: 'p-1' }),
    ...overrides,
  } as IProductRepository;
}

function buildAdditionalGroupTemplateRepository(overrides: Partial<IAdditionalGroupTemplateRepository> = {}): IAdditionalGroupTemplateRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'agt-1' }),
    ...overrides,
  } as IAdditionalGroupTemplateRepository;
}

describe('RestaurantSignupController', () => {
  function setup(
    restaurantOverrides: Partial<IRestaurantRepository> = {},
    operatorOverrides: Partial<IRestaurantOperatorRepository> = {},
  ) {
    const restaurantRepository = buildRestaurantRepository(restaurantOverrides);
    const operatorRepository = buildOperatorRepository(operatorOverrides);
    const menuCategoryRepository = buildMenuCategoryRepository();
    const productRepository = buildProductRepository();
    const additionalGroupTemplateRepository = buildAdditionalGroupTemplateRepository();
    const { application, routes } = buildFakeApplication();
    new RestaurantSignupController(
      restaurantRepository,
      operatorRepository,
      menuCategoryRepository,
      productRepository,
      additionalGroupTemplateRepository,
    ).initializeRoutes(application);
    return { restaurantRepository, operatorRepository, menuCategoryRepository, productRepository, additionalGroupTemplateRepository, routes };
  }

  it('AC-2: cria o restaurante e o operador dono, devolvendo restaurantId e slug', async () => {
    const { restaurantRepository, operatorRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/signup'],
      { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'joao@exemplo.com' } },
      { json },
    );

    expect(restaurantRepository.create).toHaveBeenCalledWith(
      // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-3 — normalizado com "55" na
      // frente antes de chegar aqui (validado no zod schema, `signupSchema`).
      expect.objectContaining({ name: 'Pizzaria do João', slug: 'pizzaria-do-joao', phone: '5511999999999', category: 'pizzaria' }),
    );
    expect(operatorRepository.create).toHaveBeenCalledWith('r-1', 'joao@exemplo.com', 'dono');
    expect(json).toHaveBeenCalledWith(201, { restaurantId: 'r-1', slug: 'pizzaria-do-joao' });
  });

  // specs/0039-onboarding-primeiro-acesso REQ-1/REQ-2/AC-1/AC-2.
  it('AC-1/AC-2 (specs/0039): restaurante nasce com horário 08:00-23:00 todo dia e destaques/banners/cancelar pedido/imagem à direita desligados', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/signup'],
      { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'joao@exemplo.com' } },
      { json },
    );

    expect(restaurantRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessHours: expect.arrayContaining([
          expect.objectContaining({ dayOfWeek: 'monday', isClosed: false, openTime: '08:00', closeTime: '23:00' }),
        ]),
        showHighlights: false,
        showBanners: false,
        allowCustomerCancelOrder: false,
        productImageOnRight: false,
      }),
    );
    const businessHoursArg = (restaurantRepository.create as jest.Mock).mock.calls[0][0].businessHours;
    expect(businessHoursArg).toHaveLength(7);
  });

  // specs/0039-onboarding-primeiro-acesso REQ-9/AC-7.
  it('AC-7 (specs/0039): cria o catálogo inicial do tipo de negócio (categoria + produtos + grupos de adicionais)', async () => {
    const { menuCategoryRepository, productRepository, additionalGroupTemplateRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/signup'],
      { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'joao@exemplo.com' } },
      { json },
    );

    expect(menuCategoryRepository.create).toHaveBeenCalledWith('r-1', 'Pizzas');
    expect(productRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ menuCategoryId: 'c-1', name: 'Pizza Margherita' }));
    expect(additionalGroupTemplateRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Tamanho' }));
  });

  it('AC-3: nome repetido gera slug com sufixo numérico, sem erro pro usuário', async () => {
    const { restaurantRepository, routes } = setup({
      findBySlug: jest.fn().mockImplementation(async (slug: string) => (slug === 'pizzaria-do-joao' ? { id: 'r-0' } : null)),
      create: jest.fn().mockResolvedValue({ id: 'r-2', name: 'Pizzaria do João', slug: 'pizzaria-do-joao-2' }),
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/signup'],
      { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'outro@exemplo.com' } },
      { json },
    );

    expect(restaurantRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'pizzaria-do-joao-2' }),
    );
    expect(json).toHaveBeenCalledWith(201, { restaurantId: 'r-2', slug: 'pizzaria-do-joao-2' });
  });

  it('nome que colide com um caminho reservado (ex. "Painel") gera slug com sufixo, não o reservado puro', async () => {
    const { restaurantRepository, routes } = setup({
      create: jest.fn().mockResolvedValue({ id: 'r-3', name: 'Painel', slug: 'painel-2' }),
    });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/signup'],
      { body: { name: 'Painel', whatsapp: '11999999999', businessType: 'lanches_gerais' }, user: { email: 'dono@exemplo.com' } },
      { json },
    );

    expect(restaurantRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'painel-2' }));
  });

  it('AC-4: e-mail já vinculado a um restaurante (ativo ou não) rejeita com 409, sem criar nada', async () => {
    const { restaurantRepository, operatorRepository, routes } = setup(
      {},
      { findByEmail: jest.fn().mockResolvedValue({ id: 'op-9', restaurantId: 'r-9', email: 'joao@exemplo.com', role: 'dono', isActive: false, createdAt: new Date() }) },
    );

    await expect(
      runAuthenticatedChain(
        routes['POST /restaurants/signup'],
        { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'joao@exemplo.com' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(restaurantRepository.create).not.toHaveBeenCalled();
    expect(operatorRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando o nome está vazio', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /restaurants/signup'],
        { body: { name: '', whatsapp: '11999999999', businessType: 'pizzaria' }, user: { email: 'joao@exemplo.com' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita com 400 quando businessType não é um dos tipos aceitos', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /restaurants/signup'],
        { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'invalido' }, user: { email: 'joao@exemplo.com' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita com 403 quando a conta autenticada não tem e-mail', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /restaurants/signup'],
        { body: { name: 'Pizzaria do João', whatsapp: '11999999999', businessType: 'pizzaria' }, user: {} },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
