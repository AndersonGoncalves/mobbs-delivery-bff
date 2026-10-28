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
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildSubaccountInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Prime Pizza', email: 'contato@primepizza.com', cpfCnpj: '12345678000190', birthDate: '1980-01-19', mobilePhone: '11999999999',
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
      // `null` por padrão = "nunca teve subconta" — exercita o caminho de criação de verdade;
      // testes de reconexão sobrescrevem isso pra devolver um restaurante com `asaasAccountId`.
      findById: jest.fn().mockResolvedValue(null),
      saveAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: true, asaasAccountId: 'acc_1' }),
      disconnectAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: false }),
      reactivateAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: true }),
      forgetAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: false }),
      reconnectPreviousAsaasSubaccount: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: true, asaasAccountId: 'acc-antiga' }),
      updateProfile: jest.fn().mockResolvedValue({ id: 'r-1' }),
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
      subaccountData: buildSubaccountInput(),
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

  // Achado real (pedido explícito do usuário) — `birthDate` ausente desde a implementação
  // original desta spec; o Asaas exige pra pessoa física (ver "Achado real" em tasks.md).
  it('payload sem birthDate é rejeitado antes de chamar o Asaas', async () => {
    const { routes } = setup();
    const invalidBody = buildSubaccountInput();
    delete (invalidBody as Record<string, unknown>).birthDate;

    await expect(
      runOperatorChain(routes['POST /restaurants/me/asaas/subaccount'], { restaurantId: 'r-1', body: invalidBody }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(MockedAsaasClient.prototype.createSubaccount).not.toHaveBeenCalled();
  });

  // Pedido explícito do usuário (follow-up) — "desvincular" a subconta, mesmo padrão de
  // `DELETE /restaurants/me/whatsapp`.
  it('DELETE /restaurants/me/asaas/subaccount desvincula (pausa, 204)', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/asaas/subaccount'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.disconnectAsaasSubaccount).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  // Pedido explícito do usuário (follow-up) — "esquecer" a subconta ATIVA, diferente de
  // desvincular: limpa os campos ativos pra vincular uma conta Asaas diferente, sem chamar o
  // Asaas (o repository arquiva os dados antigos, ver restaurant.mongoose.repository.spec.ts).
  it('DELETE /restaurants/me/asaas/subaccount/forget limpa os campos ativos (204)', async () => {
    const { restaurantRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/asaas/subaccount/forget'], { restaurantId: 'r-1' }, { json: jest.fn(), send });

    expect(restaurantRepository.forgetAsaasSubaccount).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  // Pedido explícito do usuário (follow-up) — restaura uma subconta arquivada, sem chamar o
  // Asaas de novo.
  it('POST /restaurants/me/asaas/subaccount/reconnect restaura a subconta arquivada pelo asaasAccountId', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/asaas/subaccount/reconnect'],
      { restaurantId: 'r-1', body: { asaasAccountId: 'acc-antiga' } },
      { json, send: jest.fn() },
    );

    expect(restaurantRepository.reconnectPreviousAsaasSubaccount).toHaveBeenCalledWith('r-1', 'acc-antiga');
    expect(MockedAsaasClient.prototype.createSubaccount).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { onlinePaymentsEnabled: true, asaasAccountId: 'acc-antiga' });
  });

  it('POST /restaurants/me/asaas/subaccount/reconnect sem asaasAccountId é rejeitado (400)', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/asaas/subaccount/reconnect'], { restaurantId: 'r-1', body: {} }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // Achado real (pedido explícito do usuário) — "desvincular" não apaga a subconta no Asaas;
  // reativar com os mesmos dados tentaria CRIAR outra e falharia ("CPF/e-mail já está em uso").
  // Reconectar não deve chamar o Asaas de novo.
  it('POST com subconta já existente (desvinculada antes) reconecta sem chamar o Asaas de novo', async () => {
    const { restaurantRepository, routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: false, asaasAccountId: 'acc-antiga' }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/asaas/subaccount'],
      { restaurantId: 'r-1', body: buildSubaccountInput() },
      { json, send: jest.fn() },
    );

    expect(MockedAsaasClient.prototype.createSubaccount).not.toHaveBeenCalled();
    expect(restaurantRepository.saveAsaasSubaccount).not.toHaveBeenCalled();
    expect(restaurantRepository.reactivateAsaasSubaccount).toHaveBeenCalledWith('r-1', buildSubaccountInput());
    expect(json).toHaveBeenCalledWith(200, { onlinePaymentsEnabled: true, asaasAccountId: 'acc-antiga' });
  });

  // Achado real (pedido explícito do usuário) — restaurantes vinculados ANTES de
  // `asaasSubaccountData` existir nunca tiveram esse campo salvo (formulário aparecia vazio,
  // mesmo com a subconta ativa). Reconectar salva os dados digitados agora, preenchendo o gap.
  it('POST com subconta já existente salva asaasSubaccountData mesmo sem chamar o Asaas (preenche o gap de restaurantes antigos)', async () => {
    const { restaurantRepository, routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'r-1', onlinePaymentsEnabled: false, asaasAccountId: 'acc-antiga' }),
      },
    });

    await runOperatorChain(
      routes['POST /restaurants/me/asaas/subaccount'],
      { restaurantId: 'r-1', body: buildSubaccountInput({ name: 'Outro Nome' }) },
      { json: jest.fn(), send: jest.fn() },
    );

    expect(restaurantRepository.reactivateAsaasSubaccount).toHaveBeenCalledWith('r-1', buildSubaccountInput({ name: 'Outro Nome' }));
  });

  // specs/0101-integracao-asaas (fase 2, REQ-7) — saldo/repasses da subconta.
  describe('GET /restaurants/me/asaas/balance e /transfers', () => {
    beforeEach(() => {
      MockedAsaasClient.prototype.getBalance = jest.fn().mockResolvedValue({ balance: 1234.56 });
      MockedAsaasClient.prototype.listTransfers = jest.fn().mockResolvedValue([{ id: 'tr_1', status: 'DONE', value: 100, netValue: 99, transferFee: 1, dateCreated: '2026-10-27' }]);
    });

    it('devolve o saldo da subconta do restaurante autenticado', async () => {
      const { routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', asaasApiKey: 'key-subconta' }) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/asaas/balance'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

      expect(MockedAsaasClient.prototype.getBalance).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, { balance: 1234.56 });
    });

    it('sem subconta vinculada, devolve saldo nulo sem chamar o Asaas', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1' }) } });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/asaas/balance'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

      expect(MockedAsaasClient.prototype.getBalance).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, { balance: null });
    });

    it('devolve os repasses da subconta do restaurante autenticado', async () => {
      const { routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', asaasApiKey: 'key-subconta' }) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/asaas/transfers'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

      expect(json).toHaveBeenCalledWith(200, { transfers: [{ id: 'tr_1', status: 'DONE', value: 100, netValue: 99, transferFee: 1, dateCreated: '2026-10-27' }] });
    });

    it('sem subconta vinculada, devolve lista vazia de repasses sem chamar o Asaas', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1' }) } });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/asaas/transfers'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

      expect(MockedAsaasClient.prototype.listTransfers).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, { transfers: [] });
    });
  });

  // specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10.
  describe('POST /restaurants/me/asaas/transfer-pix-key e /transfer', () => {
    beforeEach(() => {
      MockedAsaasClient.prototype.createTransfer = jest.fn();
    });

    it('salva a chave Pix de destino do repasse', async () => {
      const { restaurantRepository, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(
        routes['POST /restaurants/me/asaas/transfer-pix-key'],
        { restaurantId: 'r-1', body: { pixAddressKey: 'dono@primepizza.com', pixAddressKeyType: 'EMAIL' } },
        { json, send: jest.fn() },
      );

      expect(restaurantRepository.updateProfile).toHaveBeenCalledWith('r-1', {
        asaasTransferPixKey: 'dono@primepizza.com',
        asaasTransferPixKeyType: 'EMAIL',
      });
      expect(json).toHaveBeenCalledWith(200, { asaasTransferPixKey: 'dono@primepizza.com', asaasTransferPixKeyType: 'EMAIL' });
    });

    it('chave Pix inválida pro tipo selecionado é rejeitada (400)', async () => {
      const { routes } = setup();

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/asaas/transfer-pix-key'],
          { restaurantId: 'r-1', body: { pixAddressKey: '000', pixAddressKeyType: 'CPF' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('transfere o saldo total disponível pra chave Pix já cadastrada', async () => {
      MockedAsaasClient.prototype.getBalance = jest.fn().mockResolvedValue({ balance: 500 });
      MockedAsaasClient.prototype.createTransfer = jest.fn().mockResolvedValue({ id: 'tr_2', status: 'PENDING', value: 500, netValue: 500, transferFee: 0, dateCreated: '2026-10-28' });
      const { routes } = setup({
        restaurantRepository: {
          findById: jest.fn().mockResolvedValue({ id: 'r-1', asaasApiKey: 'key-subconta', asaasTransferPixKey: 'dono@primepizza.com', asaasTransferPixKeyType: 'EMAIL' }),
        },
      });
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/asaas/transfer'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

      expect(MockedAsaasClient.prototype.createTransfer).toHaveBeenCalledWith(500, 'dono@primepizza.com', 'EMAIL');
      expect(json).toHaveBeenCalledWith(200, { transfer: { id: 'tr_2', status: 'PENDING', value: 500, netValue: 500, transferFee: 0, dateCreated: '2026-10-28' } });
    });

    it('sem subconta Asaas conectada, rejeita antes de chamar o Asaas', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1' }) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/asaas/transfer'], { restaurantId: 'r-1' }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow(/Subconta Asaas não conectada/);
      expect(MockedAsaasClient.prototype.createTransfer).not.toHaveBeenCalled();
    });

    it('sem chave Pix de repasse cadastrada, rejeita antes de chamar o Asaas', async () => {
      const { routes } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', asaasApiKey: 'key-subconta' }) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/asaas/transfer'], { restaurantId: 'r-1' }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow(/Cadastre a chave Pix/);
      expect(MockedAsaasClient.prototype.createTransfer).not.toHaveBeenCalled();
    });

    it('saldo zerado/insuficiente, rejeita antes de chamar o Asaas', async () => {
      MockedAsaasClient.prototype.getBalance = jest.fn().mockResolvedValue({ balance: 0 });
      const { routes } = setup({
        restaurantRepository: {
          findById: jest.fn().mockResolvedValue({ id: 'r-1', asaasApiKey: 'key-subconta', asaasTransferPixKey: 'dono@primepizza.com', asaasTransferPixKeyType: 'EMAIL' }),
        },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/asaas/transfer'], { restaurantId: 'r-1' }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow(/Saldo disponível insuficiente/);
      expect(MockedAsaasClient.prototype.createTransfer).not.toHaveBeenCalled();
    });
  });
});
