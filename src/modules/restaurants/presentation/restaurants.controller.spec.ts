import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { RestaurantsController } from './restaurants.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId' | 'query'>> & {
  operatorRole?: Request['operatorRole'];
};
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = {
    get: register('GET'),
    put: register('PUT'),
    patch: register('PATCH'),
    post: register('POST'),
    del: register('DEL'),
  };
  return { application: application as unknown as Server, routes };
}

async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

// Pula `firebaseAuthMiddleware` (primeiro da chain autenticada) — tem spec própria
// (firebase-auth.middleware.spec.ts); aqui o foco é só o comportamento do controller a partir do
// restaurantOperatorMiddleware (fake, sempre resolve restaurantId '1') em diante.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  return runChain(handlers.slice(1), req, res);
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = '1';
  req.operatorRole = 'dono';
};

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    ...overrides,
  };
}

describe('RestaurantsController', () => {
  describe('GET /restaurants/resolve/:slug (público)', () => {
    it('AC-1: retorna 200 com o restaurante quando o slug corresponde a um ativo', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant()),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'primepizza' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    // Achado real (pedido explícito do usuário, auditoria de segurança) — essa rota é pública,
    // sem nenhuma autenticação; nenhuma chave/segredo pode aparecer na resposta.
    it('nunca devolve chaves/segredos do restaurante (autoPrintApiKey, paymentWebhookApiKey, asaasApiKey, asaasWebhookToken, mercadoPagoAccessToken, mercadoPagoRefreshToken)', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant({
          autoPrintApiKey: 'segredo-print',
          paymentWebhookApiKey: 'segredo-webhook',
          asaasApiKey: 'segredo-asaas',
          asaasWebhookToken: 'segredo-asaas-webhook',
          mercadoPagoAccessToken: 'segredo-mp-access',
          mercadoPagoRefreshToken: 'segredo-mp-refresh',
        })),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(application);
      const json = jest.fn();

      await routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'primepizza' } }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload).not.toHaveProperty('autoPrintApiKey');
      expect(payload).not.toHaveProperty('paymentWebhookApiKey');
      expect(payload).not.toHaveProperty('asaasApiKey');
      expect(payload).not.toHaveProperty('asaasWebhookToken');
      expect(payload).not.toHaveProperty('mercadoPagoAccessToken');
      expect(payload).not.toHaveProperty('mercadoPagoRefreshToken');
      // confirma que não é só um objeto vazio por engano — os campos públicos continuam lá.
      expect(payload).toMatchObject({ id: '1', slug: 'primepizza', name: 'Prime Pizza' });
    });

    it('AC-2/AC-6: lança erro 404 quando o slug não corresponde a nenhum restaurante', async () => {
      const repository: Partial<IRestaurantRepository> = { findBySlug: jest.fn().mockResolvedValue(null) };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'inexistente' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // specs/0046-abrir-fechar-restaurante-manual REQ-3 (bug, specs/0054) — resolvia como 404
    // antes; restaurante fechado manualmente/de férias (isActive: false) precisa continuar
    // resolvendo normalmente, senão o cliente nunca vê o banner de "fechado" (cai numa tela de
    // "restaurante não encontrado" em vez disso).
    it('AC-1 (specs/0054): resolve normalmente (200) quando o restaurante existe mas está inativo (fechado)', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false, slug: 'fechado' })),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'fechado' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'fechado', isActive: false }));
    });
  });

  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10/AC-12.
  describe('GET /restaurants/:id/delivery-fee (público)', () => {
    it('resolve o feeCents da zona correspondente ao bairro', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({
            deliveryFeeMode: 'byNeighborhood',
            deliveryFeeZones: [
              { id: 'z-1', neighborhood: 'Centro', feeCents: 500 },
              { id: 'z-2', neighborhood: 'Jardins', feeCents: 800 },
            ],
          }),
        ),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: '1' }, query: { neighborhood: 'Jardins' } }, { json });

      expect(json).toHaveBeenCalledWith(200, { feeCents: 800 });
    });

    it('bairro não cadastrado volta feeCents null, sem lançar erro', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({ deliveryFeeMode: 'byNeighborhood', deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: 500 }] }),
        ),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: '1' }, query: { neighborhood: 'Inexistente' } }, { json });

      expect(json).toHaveBeenCalledWith(200, { feeCents: null });
    });

    it('lança 404 quando o restaurante não existe', async () => {
      const repository: Partial<IRestaurantRepository> = { findById: jest.fn().mockResolvedValue(null) };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/:id/delivery-fee'][0]({ params: { id: 'inexistente' }, query: {} }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('rotas autenticadas /restaurants/me/... (specs/0010)', () => {
    function setup(repositoryOverrides: Partial<IRestaurantRepository> = {}) {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(buildRestaurant()),
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ name: 'Novo nome' })),
        updateBusinessHours: jest.fn().mockResolvedValue(buildRestaurant()),
        setActive: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })),
        updateSlug: jest.fn().mockResolvedValue(buildRestaurant({ slug: 'novo-slug' })),
        ...repositoryOverrides,
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );
      return { repository, routes };
    }

    it('AC-1: GET /restaurants/me retorna o restaurante do restaurantId resolvido pelo token', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me'], { restaurantId: undefined }, { json });

      expect(repository.findById).toHaveBeenCalledWith('1');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    // Achado real (pedido explícito do usuário, auditoria de segurança) — diferente da rota
    // pública, aqui o operador PODE ver `autoPrintApiKey` (a UI mostra/copia de propósito,
    // `AutoPrintSettingsPage.tsx`), mas não os outros segredos (nunca têm tela pra exibir o
    // valor bruto, só confirmar "vinculado"/"ativo").
    it('GET /restaurants/me devolve autoPrintApiKey, mas nunca paymentWebhookApiKey/asaasApiKey/asaasWebhookToken/mercadoPagoAccessToken/mercadoPagoRefreshToken', async () => {
      const { routes } = setup({
        findById: jest.fn().mockResolvedValue(buildRestaurant({
          autoPrintApiKey: 'chave-print-visivel',
          paymentWebhookApiKey: 'segredo-webhook',
          asaasApiKey: 'segredo-asaas',
          asaasWebhookToken: 'segredo-asaas-webhook',
          mercadoPagoAccessToken: 'segredo-mp-access',
          mercadoPagoRefreshToken: 'segredo-mp-refresh',
        })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me'], { restaurantId: undefined }, { json });

      const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
      expect(payload).toMatchObject({ autoPrintApiKey: 'chave-print-visivel' });
      expect(payload).not.toHaveProperty('paymentWebhookApiKey');
      expect(payload).not.toHaveProperty('asaasApiKey');
      expect(payload).not.toHaveProperty('asaasWebhookToken');
      expect(payload).not.toHaveProperty('mercadoPagoAccessToken');
      expect(payload).not.toHaveProperty('mercadoPagoRefreshToken');
    });

    // specs/0083-modalidade-entrega-retirada-restaurante REQ-2/REQ-3/AC-2.
    it('specs/0083: PUT /restaurants/me rejeita (400) salvar sem nenhuma modalidade marcada', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { orderTypes: [] } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-1/AC-7: PUT /restaurants/me valida o payload e persiste só os campos enviados', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { name: 'Novo nome' } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { name: 'Novo nome' });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ name: 'Novo nome' }));
    });

    it('permite que Caixa altere apenas as configurações de impressão automática', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await routes['PUT /restaurants/me'][2](
        { restaurantId: '1', operatorRole: 'financeiro', body: { autoPrintEnabled: true } },
        { json },
      );

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { autoPrintEnabled: true });
    });

    it('bloqueia Caixa ao alterar dados reservados a dono e gerente', async () => {
      const { repository, routes } = setup();

      await expect(
        routes['PUT /restaurants/me'][2](
          { operatorRole: 'financeiro', body: { name: 'Nome não autorizado' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.updateProfile).not.toHaveBeenCalled();
    });

    it('bloqueia Caixa ao alterar horário de funcionamento', async () => {
      const { routes } = setup();

      await expect(
        routes['PUT /restaurants/me/business-hours'][2](
          { operatorRole: 'financeiro', body: [] },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-1/REQ-2/AC-1.
    it('specs/0151: PUT /restaurants/me aceita e persiste autoConfirmPaymentMethods junto de acceptedPaymentMethods', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ acceptedPaymentMethods: ['cash', 'pix'], autoConfirmPaymentMethods: ['cash'] })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['PUT /restaurants/me'],
        { body: { acceptedPaymentMethods: ['cash', 'pix'], autoConfirmPaymentMethods: ['cash'] } },
        { json },
      );

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { acceptedPaymentMethods: ['cash', 'pix'], autoConfirmPaymentMethods: ['cash'] });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ autoConfirmPaymentMethods: ['cash'] }));
    });

    // Pedido explícito do usuário — "Cartão de Crédito Online" (specs/0173) não estava salvando
    // em "Formas de Pagamento".
    it('specs/0173: PUT /restaurants/me aceita e persiste acceptedPaymentMethods com creditCardOnline', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ acceptedPaymentMethods: ['cash', 'creditCardOnline'] })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['PUT /restaurants/me'],
        { body: { acceptedPaymentMethods: ['cash', 'creditCardOnline'] } },
        { json },
      );

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { acceptedPaymentMethods: ['cash', 'creditCardOnline'] });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ acceptedPaymentMethods: ['cash', 'creditCardOnline'] }));
    });

    it('specs/0151 AC-1: PUT /restaurants/me rejeita (400) autoConfirmPaymentMethods com forma fora de acceptedPaymentMethods', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['PUT /restaurants/me'],
          { body: { acceptedPaymentMethods: ['cash'], autoConfirmPaymentMethods: ['pix'] } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('specs/0151: PUT /restaurants/me rejeita (400) autoConfirmPaymentMethods sem acceptedPaymentMethods no mesmo payload', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['PUT /restaurants/me'],
          { body: { autoConfirmPaymentMethods: ['cash'] } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-2.
    it('PUT /restaurants/me aceita e persiste shareMessage', async () => {
      const shareMessage = 'Olá! Queria te indicar o InstaDelivery...';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ shareMessage })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { shareMessage } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { shareMessage });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ shareMessage }));
    });

    it('rejeita PUT /restaurants/me com cor fora do formato #RRGGBB', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { primaryColor: 'azul' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-4.
    it('rejeita PUT /restaurants/me com CNPJ inválido', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { document: '11222333000100' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('PUT /restaurants/me aceita e persiste um CNPJ válido', async () => {
      const document = '11222333000181';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ document })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { document } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { document });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ document }));
    });

    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-8.
    it('PUT /restaurants/me aceita e persiste productImageOnRight', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ productImageOnRight: false })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { productImageOnRight: false } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { productImageOnRight: false });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ productImageOnRight: false }));
    });

    // Pedido explícito do usuário — "Identidade visual": toggles de cor da barra de navegação
    // inferior/campos de texto/caixa de busca, e o enum de 3 opções da barra de status (gap de
    // cobertura pré-existente: nenhum teste de persistência de verdade cobria estes campos).
    it('PUT /restaurants/me aceita e persiste useWhiteBottomNavBar', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ useWhiteBottomNavBar: false })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { useWhiteBottomNavBar: false } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { useWhiteBottomNavBar: false });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ useWhiteBottomNavBar: false }));
    });

    it('PUT /restaurants/me aceita e persiste statusBarColorMode', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ statusBarColorMode: 'primary' })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { statusBarColorMode: 'primary' } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { statusBarColorMode: 'primary' });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ statusBarColorMode: 'primary' }));
    });

    it('PUT /restaurants/me rejeita (400) statusBarColorMode fora do enum', async () => {
      const { repository, routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { statusBarColorMode: 'rainbow' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(repository.updateProfile).not.toHaveBeenCalled();
    });

    it('PUT /restaurants/me aceita e persiste useWhiteTextFieldColor e useWhiteSearchFieldColor', async () => {
      const { repository, routes } = setup({
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ useWhiteTextFieldColor: true, useWhiteSearchFieldColor: true })),
      });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['PUT /restaurants/me'],
        { body: { useWhiteTextFieldColor: true, useWhiteSearchFieldColor: true } },
        { json },
      );

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { useWhiteTextFieldColor: true, useWhiteSearchFieldColor: true });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ useWhiteTextFieldColor: true, useWhiteSearchFieldColor: true }));
    });

    it('PUT /restaurants/me aceita e persiste onPrimaryColor', async () => {
      const onPrimaryColor = '#000000';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ onPrimaryColor })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { onPrimaryColor } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { onPrimaryColor });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ onPrimaryColor }));
    });

    it('rejeita PUT /restaurants/me com onPrimaryColor fora do formato #RRGGBB', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { onPrimaryColor: 'branco' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0156-filtro-idade-impressao-automatica REQ-2.
    it('specs/0156: PUT /restaurants/me aceita e persiste autoPrintMaxAgeMinutes', async () => {
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ autoPrintMaxAgeMinutes: 15 })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { autoPrintMaxAgeMinutes: 15 } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { autoPrintMaxAgeMinutes: 15 });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ autoPrintMaxAgeMinutes: 15 }));
    });

    it('specs/0156: rejeita PUT /restaurants/me com autoPrintMaxAgeMinutes fora de 1-60', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { autoPrintMaxAgeMinutes: 0 } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { autoPrintMaxAgeMinutes: 61 } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-1.
    it('PUT /restaurants/me aceita e persiste defaultProductImageUrl', async () => {
      const defaultProductImageUrl = 'https://storage.example.com/restaurants/1/default-product-image.png';
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ defaultProductImageUrl })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { defaultProductImageUrl } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { defaultProductImageUrl });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ defaultProductImageUrl }));
    });

    it('rejeita PUT /restaurants/me com defaultProductImageUrl que não é uma URL', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { defaultProductImageUrl: 'não-é-url' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0028-destaques-vendidos-banners REQ-1, REQ-4, REQ-10.
    it('PUT /restaurants/me aceita e persiste showBestSellers/showCartSuggestions/showHighlights/showBanners', async () => {
      const patch = { showBestSellers: true, showCartSuggestions: true, showHighlights: false, showBanners: false };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0062-confirmar-pedido-whatsapp-restaurante AC-1.
    it('PUT /restaurants/me aceita e persiste notifyRestaurantOnNewOrder/newOrderRestaurantWhatsAppTemplate', async () => {
      const patch = { notifyRestaurantOnNewOrder: false, newOrderRestaurantWhatsAppTemplate: 'Pedido #{numeroPedido} confirmado!' };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0063-notificacao-whatsapp-pedido-confirmado AC-1.
    it('PUT /restaurants/me aceita e persiste notifyCustomerOnOrderConfirmed/orderConfirmedWhatsAppTemplate', async () => {
      const patch = { notifyCustomerOnOrderConfirmed: false, orderConfirmedWhatsAppTemplate: 'Oi {nomeCliente}, pedido confirmado!' };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0064-notificacao-whatsapp-pix-confirmado AC-1.
    it('PUT /restaurants/me aceita e persiste notifyCustomerOnPixConfirmed/pixConfirmedWhatsAppTemplate', async () => {
      const patch = { notifyCustomerOnPixConfirmed: false, pixConfirmedWhatsAppTemplate: 'Pix recebido, {nomeCliente}!' };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0069.
    it('PUT /restaurants/me aceita e persiste notifyCustomerOnOrderCreated/orderReceiptWhatsAppTemplate', async () => {
      const patch = { notifyCustomerOnOrderCreated: false, orderReceiptWhatsAppTemplate: 'Recibo {numeroPedido}' };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0065-notificacao-whatsapp-saiu-para-entrega AC-1.
    it('PUT /restaurants/me aceita e persiste notifyCustomerOnOrderOutForDelivery/orderOutForDeliveryWhatsAppTemplate', async () => {
      const patch = { notifyCustomerOnOrderOutForDelivery: false, orderOutForDeliveryWhatsAppTemplate: 'Saiu, {nomeCliente}!' };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0071.
    it('PUT /restaurants/me aceita e persiste os toggles/templates de preparo e cancelamento', async () => {
      const patch = {
        notifyCustomerOnOrderPreparing: false,
        orderPreparingWhatsAppTemplate: 'Preparando {numeroPedido}',
        notifyCustomerOnOrderCancelled: false,
        orderCancelledWhatsAppTemplate: 'Cancelado {numeroPedido}: {motivoCancelamento}',
      };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2.
    it('PUT /restaurants/me aceita e persiste allowCustomerCancelOrder', async () => {
      const patch = { allowCustomerCancelOrder: false };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10/REQ-9.
    it('PUT /restaurants/me aceita e persiste deliveryFeeMode/deliveryFeeZones/instagramUrl', async () => {
      const patch = {
        deliveryFeeMode: 'byNeighborhood' as const,
        deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: 500 }],
        instagramUrl: 'https://instagram.com/primepizza',
      };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1.
    it('PUT /restaurants/me aceita e persiste showHighlightsInMultipleRows', async () => {
      const patch = { showHighlightsInMultipleRows: true };
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant(patch)) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: patch }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', patch);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining(patch));
    });

    it('rejeita PUT /restaurants/me com deliveryFeeZones com feeCents negativo', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['PUT /restaurants/me'],
          { body: { deliveryFeeZones: [{ id: 'z-1', neighborhood: 'Centro', feeCents: -1 }] } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita PUT /restaurants/me com instagramUrl que não é uma URL', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { instagramUrl: 'não-é-url' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // specs/0028-destaques-vendidos-banners REQ-5/REQ-6 — bannerSchema.superRefine.
    it('PUT /restaurants/me aceita e persiste banners com o campo de destino certo por linkType', async () => {
      const banners = [
        { id: 'b-1', imageUrl: 'https://exemplo.com/1.png', linkType: 'product', productId: 'p-1' },
        { id: 'b-2', imageUrl: 'https://exemplo.com/2.png', linkType: 'category', menuCategoryId: 'c-1' },
        { id: 'b-3', imageUrl: 'https://exemplo.com/3.png', linkType: 'externalUrl', externalUrl: 'https://exemplo.com' },
        { id: 'b-4', imageUrl: 'https://exemplo.com/4.png', linkType: 'none' },
        { id: 'b-5', imageUrl: 'https://exemplo.com/5.png', linkType: 'highlights' },
        { id: 'b-6', imageUrl: 'https://exemplo.com/6.png', linkType: 'bestSellers' },
      ];
      const { repository, routes } = setup({ updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ banners })) });
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { banners } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { banners });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ banners }));
    });

    it.each([
      ['product', {}],
      ['category', {}],
      ['externalUrl', {}],
    ])('rejeita banner com linkType "%s" sem o campo de destino correspondente', async (linkType, extra) => {
      const { routes } = setup();
      const banners = [{ id: 'b-1', imageUrl: 'https://exemplo.com/1.png', linkType, ...extra }];

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { banners } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-6: rejeita horário com fechamento antes da abertura no mesmo dia', async () => {
      const { routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '18:00', closeTime: '08:00' }];

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-2: PUT /restaurants/me/business-hours aceita horário válido', async () => {
      const { repository, routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '08:00', closeTime: '18:00' }];
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json });

      expect(repository.updateBusinessHours).toHaveBeenCalledWith('1', body);
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('AC-3: PATCH /restaurants/me/active desativa o restaurante', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PATCH /restaurants/me/active'], { body: { isActive: false } }, { json });

      expect(repository.setActive).toHaveBeenCalledWith('1', false);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
    });

    // specs/0162-topbar-busca-breadcrumb REQ-5/AC-5 — revoga, só pra esta rota, a exceção
    // "somente Dono" da specs/0161: dono, gerente e financeiro ("Caixa") agora abrem/fecham.
    it.each(['dono', 'gerente', 'financeiro'])(
      'AC-5: %s pode abrir ou fechar o restaurante (200)',
      async (operatorRole) => {
        const roleMiddleware = async (req: FakeRequest) => {
          req.restaurantId = '1';
          req.operatorRole = operatorRole as FakeRequest['operatorRole'];
        };
        const { repository, routes } = (() => {
          const repository: Partial<IRestaurantRepository> = {
            setActive: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })),
          };
          const { application, routes } = buildFakeApplication();
          new RestaurantsController(
            repository as IRestaurantRepository,
            roleMiddleware as unknown as (req: Request, res: Response) => Promise<void>,
          ).initializeRoutes(application);
          return { repository, routes };
        })();
        const json = jest.fn();

        await runAuthenticatedChain(
          routes['PATCH /restaurants/me/active'],
          { body: { isActive: false }, operatorRole: operatorRole as FakeRequest['operatorRole'] },
          { json },
        );

        expect(repository.setActive).toHaveBeenCalledWith('1', false);
        expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
      },
    );

    // specs/0162-topbar-busca-breadcrumb REQ-5/AC-6 — garçom e motoboy continuam sem acesso.
    it.each(['garcom', 'motoboy'])('AC-6: %s não pode abrir ou fechar o restaurante (403)', async (operatorRole) => {
      const roleMiddleware = async (req: FakeRequest) => {
        req.restaurantId = '1';
        req.operatorRole = operatorRole as FakeRequest['operatorRole'];
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(
        { setActive: jest.fn() } as unknown as IRestaurantRepository,
        roleMiddleware as unknown as (req: Request, res: Response) => Promise<void>,
      ).initializeRoutes(application);

      await expect(
        runAuthenticatedChain(
          routes['PATCH /restaurants/me/active'],
          { body: { isActive: false }, operatorRole: operatorRole as FakeRequest['operatorRole'] },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-4/AC-5: GET /restaurants/me/onboarding retorna URL web e link nativo a partir do slug', async () => {
      const { routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me/onboarding'], {}, { json });

      expect(json).toHaveBeenCalledWith(200, {
        slug: 'primepizza',
        webUrl: 'https://bsdelivery.com.br/primepizza',
        nativeLink: 'https://bsdelivery.com.br/r/primepizza',
      });
    });

    it('AC-11: PUT /restaurants/me/slug troca o slug', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'novo-slug' } }, { json });

      expect(repository.updateSlug).toHaveBeenCalledWith('1', 'novo-slug');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'novo-slug' }));
    });

    it('rejeita PUT /restaurants/me/slug com caractere inválido', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'Slug Inválido!' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
