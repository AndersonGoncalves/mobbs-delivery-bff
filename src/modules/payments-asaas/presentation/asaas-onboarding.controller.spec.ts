import type { Request, Response, Server } from 'restify';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { AsaasClient } from '../infra/asaas-client';
import { AsaasOnboardingController } from './asaas-onboarding.controller';

jest.mock('../infra/asaas-client');
// Controller lança erro cedo sem `environment.asaas.apiKey` (chave da conta mãe) configurada —
// mock evita depender de `ASAAS_API_KEY` estar setada no ambiente de teste.
jest.mock('../../../shared/config/environment', () => ({
  environment: { asaas: { apiKey: 'parent-key', baseUrl: 'https://api-sandbox.asaas.com/v3' }, server: { publicBaseUrl: 'https://api.bsdelivery.com.br' } },
}));

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildSubaccountInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Prime Pizza', email: 'contato@primepizza.com', cpfCnpj: '12345678000190', mobilePhone: '11999999999',
    incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01000000',
    ...overrides,
  };
}

describe('AsaasOnboardingController (specs/0101-integracao-asaas, fase 1)', () => {
  const MockedAsaasClient = AsaasClient as jest.MockedClass<typeof AsaasClient>;

  beforeEach(() => {
    MockedAsaasClient.mockClear();
    MockedAsaasClient.prototype.createSubaccount = jest.fn().mockResolvedValue({ id: 'acc_1', walletId: 'wallet_1', apiKey: 'key-subconta' });
  });

  function setup(overrides: { restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      saveAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: true, asaasAccountId: 'acc_1' }),
      ...overrides.restaurantRepository,
    };
    const { application, routes } = buildApp();
    new AsaasOnboardingController(restaurantRepository as IRestaurantRepository, jest.fn()).initializeRoutes(application);
    return { restaurantRepository, routes };
  }

  it('AC-1: operador dono/gerente cadastra a subconta e persiste os campos devolvidos pelo Asaas, sem expor a chave', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/asaas/subaccount'],
      { restaurantId: 'r-1', body: buildSubaccountInput() },
      { json, send: jest.fn() },
    );

    expect(restaurantRepository.saveAsaasSubaccount).toHaveBeenCalledWith('r-1', {
      asaasAccountId: 'acc_1',
      asaasWalletId: 'wallet_1',
      asaasApiKey: 'key-subconta',
      asaasWebhookToken: expect.any(String),
    });
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('asaasApiKey');
    expect(payload).toMatchObject({ onlinePaymentsEnabled: true });
  });

  it('registra a URL de webhook com o restaurantId do operador autenticado', async () => {
    setup();
    const { routes } = setup();

    await runOperatorChain(
      routes['POST /restaurants/me/asaas/subaccount'],
      { restaurantId: 'r-42', body: buildSubaccountInput() },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(MockedAsaasClient.prototype.createSubaccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Prime Pizza' }),
      expect.stringContaining('/webhooks/asaas/r-42'),
      expect.any(String),
    );
  });

  it('payload inválido (sem cpfCnpj) é rejeitado antes de chamar o Asaas', async () => {
    const { routes } = setup();
    const invalidBody = buildSubaccountInput();
    delete (invalidBody as Record<string, unknown>).cpfCnpj;

    await expect(
      runOperatorChain(routes['POST /restaurants/me/asaas/subaccount'], { restaurantId: 'r-1', body: invalidBody }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(MockedAsaasClient.prototype.createSubaccount).not.toHaveBeenCalled();
  });
});
