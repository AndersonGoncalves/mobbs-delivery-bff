import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { IProduct } from '../../../catalog/domain/entities/product.entity';
import { IFiscalConfigRepository } from '../repositories/fiscal-config.repository.interface';
import { IFiscalConfig } from '../entities/fiscal-config.entity';
import { FocusNfeApiClient } from '../../infra/focus-nfe-client';
import { FiscalEmissionService } from './fiscal-emission.service';

jest.mock('../../infra/focus-nfe-client');

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 1,
    trackingToken: 'tok-1',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza', quantity: 1, unitPrice: 30 }],
    orderType: 'delivery',
    status: 'entregue',
    statusHistory: [],
    subtotal: 30,
    deliveryFee: 5,
    discount: 0,
    total: 35,
    paymentMethod: 'pix',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildProduct(overrides: Partial<IProduct> = {}): IProduct {
  return {
    id: 'p-1',
    restaurantId: 'r-1',
    menuCategoryId: 'cat-1',
    name: 'Pizza',
    price: 30,
    isAvailable: true,
    additionalGroups: [],
    isFeatured: false,
    featuredOrder: 0,
    availableAsAdditional: false,
    tracksStock: false,
    activeDays: [],
    isAlcoholic: false,
    isBestSeller: false,
    bestSellerOrder: 0,
    isSuggestedInCart: false,
    cartSuggestionOrder: 0,
    unit: 'UN',
    ...overrides,
  };
}

function buildConfig(overrides: Partial<IFiscalConfig> = {}): IFiscalConfig {
  return {
    restaurantId: 'r-1',
    focusNfeToken: 'token-1',
    environment: 'homologacao',
    documentType: 'nfce',
    productionEnabled: false,
    autoEmitEnabled: true,
    webhookToken: 'webhook-token-1',
    cnpj: '11222333000181',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FiscalEmissionService (specs/0091-integracao-fiscal-focusnfe)', () => {
  const MockedClient = FocusNfeApiClient as jest.MockedClass<typeof FocusNfeApiClient>;

  beforeEach(() => {
    MockedClient.mockClear();
    // Reatribuídos frescos a cada teste — `prototype.xxx = jest.fn()` é compartilhado entre
    // instâncias (mesmo protótipo), então `mockClear()` sozinho não zera chamadas registradas
    // num teste anterior.
    MockedClient.prototype.emitNfce = jest.fn();
    MockedClient.prototype.cancelNfce = jest.fn();
  });

  function setup(overrides: {
    fiscalConfigRepository?: Partial<IFiscalConfigRepository>;
    orderRepository?: Partial<IOrderRepository>;
    productRepository?: Partial<IProductRepository>;
  } = {}) {
    const fiscalConfigRepository: Partial<IFiscalConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      ...overrides.fiscalConfigRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      updateFiscal: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([]),
      ...overrides.productRepository,
    };
    const service = new FiscalEmissionService(
      fiscalConfigRepository as IFiscalConfigRepository,
      orderRepository as IOrderRepository,
      productRepository as IProductRepository,
      { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' },
    );
    return { service, fiscalConfigRepository, orderRepository, productRepository };
  }

  describe('emitForOrder (REQ-2)', () => {
    it('AC-2: pedido entregue com config em homologação emite automaticamente (sem precisar do botão de produção)', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });
      const { service, orderRepository } = setup();

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalledWith('o-1', expect.objectContaining({ cnpj_emitente: '11222333000181' }));
      expect(orderRepository.updateFiscal).toHaveBeenCalledWith('o-1', { status: 'pendente' });
      expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'emitido', ref: 'o-1', documentUrl: '/notas/o-1.html' });
    });

    // Achado real (13/11/2026, pedido explícito do usuário — análise do payload de verdade
    // enviado à FocusNFe durante um teste real em homologação): `FiscalConfig.cnpj` é digitado
    // pelo operador COM máscara (`FiscalIntegrationPage.tsx` não normaliza, só valida o dígito
    // verificador) — enviar `cnpj_emitente` com máscara causava rejeição "Emissor não habilitado
    // para emissão da NF-e/NFC-e" mesmo com CSC e credenciamento corretos na SEFAZ, porque os
    // exemplos reais da FocusNFe esperam só os 14 dígitos.
    it('normaliza o CNPJ do emitente (remove máscara) antes de enviar à FocusNFe, mesmo que o operador tenha digitado com pontuação', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ cnpj: '07.456.684/0001-80' })),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalledWith('o-1', expect.objectContaining({ cnpj_emitente: '07456684000180' }));
    });

    it('AC-5/REQ-6: pedido cancelado nunca gera nota (nem tenta chamar a FocusNFe)', async () => {
      const { service, orderRepository } = setup();

      await service.emitForOrder(buildOrder({ status: 'cancelado' }));

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('idempotência: pedido já com nota emitida não tenta emitir de novo', async () => {
      const { service, orderRepository } = setup();

      await service.emitForOrder(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }));

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('sem FiscalConfig pro restaurante, não emite (integração desligada)', async () => {
      const { service, fiscalConfigRepository, orderRepository } = setup({
        fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(null) },
      });

      await service.emitForOrder(buildOrder());

      expect(fiscalConfigRepository.findByRestaurantId).toHaveBeenCalledWith('r-1');
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('produção configurada SEM o botão "ativar produção" ligado: nunca emite (risco fiscal real, plan.md)', async () => {
      const { service, orderRepository } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ environment: 'producao', productionEnabled: false })),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('produção COM o botão "ativar produção" ligado: emite normalmente', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ environment: 'producao', productionEnabled: true })),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalled();
    });

    // specs/0204-controle-emissao-fiscal-automatica
    it('AC-1 (0204): autoEmitEnabled false bloqueia a emissão automática mesmo com config válida em homologação', async () => {
      const { service, orderRepository } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ autoEmitEnabled: false })),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('AC-6 (0204): autoEmitEnabled false + produção + productionEnabled true continua bloqueando (checagens independentes)', async () => {
      const { service, orderRepository } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(
            buildConfig({ environment: 'producao', productionEnabled: true, autoEmitEnabled: false }),
          ),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).not.toHaveBeenCalled();
    });

    it('REQ-1 (0204): autoEmitEnabled true (padrão) continua emitindo automaticamente — não regride o comportamento atual', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service, orderRepository } = setup({
        fiscalConfigRepository: {
          findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ autoEmitEnabled: true })),
        },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalled();
      expect(orderRepository.updateFiscal).toHaveBeenCalledWith('o-1', { status: 'pendente' });
    });

    // specs/0207-dados-fiscais-cadastro.
    describe.each([
      ['sem taxRegime cadastrado', undefined],
      ['simplesNacional', 'simplesNacional' as const],
      ['simplesNacionalExcesso', 'simplesNacionalExcesso' as const],
      ['mei', 'mei' as const],
    ])('AC-2 (0207): %s', (_label, taxRegime) => {
      it('emite normalmente com o CSOSN genérico de hoje', async () => {
        MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
        const { service, orderRepository } = setup({
          fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ taxRegime })) },
        });

        await service.emitForOrder(buildOrder());

        expect(MockedClient.prototype.emitNfce).toHaveBeenCalledWith('o-1', expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ icms_situacao_tributaria: '102' })]) }));
        expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'emitido', ref: 'o-1', documentUrl: undefined });
      });
    });

    it('AC-3 (0207): taxRegime "regimeNormal" bloqueia a emissão automática, sem chamar a FocusNFe', async () => {
      const { service, orderRepository } = setup({
        fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ taxRegime: 'regimeNormal' })) },
      });

      await service.emitForOrder(buildOrder());

      expect(MockedClient.prototype.emitNfce).not.toHaveBeenCalled();
      expect(orderRepository.updateFiscal).toHaveBeenCalledWith('o-1', {
        status: 'rejeitado',
        rejectedReason: 'Regime tributário Normal exige configuração de CST por produto — revisar com contador antes de emitir.',
      });
    });

    it('AC-7 (0207): produto com CEST cadastrado inclui "cest" no item; sem CEST, o campo não é enviado', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue([buildProduct({ id: 'p-1', cestCode: '0300100' })]) },
      });

      await service.emitForOrder(buildOrder());

      const [, input] = MockedClient.prototype.emitNfce.mock.calls[0];
      expect(input.items[0].cest).toBe('0300100');
    });

    it('AC-7 (0207): produto sem CEST não inclui o campo no item', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue([buildProduct({ id: 'p-1' })]) },
      });

      await service.emitForOrder(buildOrder());

      const [, input] = MockedClient.prototype.emitNfce.mock.calls[0];
      expect(input.items[0]).not.toHaveProperty('cest');
    });

    it('AC-8 (0207): produto sem GTIN emite "SEM GTIN"; produto com GTIN emite o valor cadastrado', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue([buildProduct({ id: 'p-1', gtin: '7891234567890' })]) },
      });

      await service.emitForOrder(buildOrder());

      const [, input] = MockedClient.prototype.emitNfce.mock.calls[0];
      expect(input.items[0].gtin).toBe('7891234567890');
      expect(input.items[0].gtin_tributavel).toBe('7891234567890');
    });

    it('AC-8 (0207): produto sem GTIN emite "SEM GTIN"', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue([buildProduct({ id: 'p-1' })]) },
      });

      await service.emitForOrder(buildOrder());

      const [, input] = MockedClient.prototype.emitNfce.mock.calls[0];
      expect(input.items[0].gtin).toBe('SEM GTIN');
      expect(input.items[0].gtin_tributavel).toBe('SEM GTIN');
    });

    it('AC-9 (0207): produto com unidade "KG" emite unidade_comercial/unidade_tributavel como "KG"; taxa de entrega continua "UN"', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado' });
      const { service } = setup({
        productRepository: { listByRestaurant: jest.fn().mockResolvedValue([buildProduct({ id: 'p-1', unit: 'KG' })]) },
      });

      await service.emitForOrder(buildOrder({ deliveryFee: 5 }));

      const [, input] = MockedClient.prototype.emitNfce.mock.calls[0];
      expect(input.items[0].unidade_comercial).toBe('KG');
      expect(input.items[0].unidade_tributavel).toBe('KG');
      const deliveryFeeItem = input.items.find((item: { codigo_produto: string }) => item.codigo_produto === 'TAXA-ENTREGA');
      expect(deliveryFeeItem.unidade_comercial).toBe('UN');
    });

    it('AC-3/REQ-4: rejeição da FocusNFe grava status "rejeitado" com o motivo, sem lançar', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'erro_autorizacao', mensagem_sefaz: 'Rejeição 704' });
      const { service, orderRepository } = setup();

      await expect(service.emitForOrder(buildOrder())).resolves.toBeUndefined();

      expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'rejeitado', ref: 'o-1', rejectedReason: 'Rejeição 704' });
    });

    it('erro de rede/transporte também vira "rejeitado" (REQ-4: nunca travar o fluxo do pedido)', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockRejectedValue(new Error('timeout'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { service, orderRepository } = setup();

      await expect(service.emitForOrder(buildOrder())).resolves.toBeUndefined();

      expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'rejeitado', rejectedReason: 'timeout' });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('retryEmission (REQ-4)', () => {
    it('reemite usando a config recebida (precondição já validada pelo controller)', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });
      const { service, orderRepository } = setup();

      await service.retryEmission(buildOrder({ fiscal: { status: 'rejeitado', rejectedReason: 'Rejeição 704' } }), buildConfig());

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalled();
      expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'emitido', ref: 'o-1', documentUrl: '/notas/o-1.html' });
    });

    // specs/0204-controle-emissao-fiscal-automatica AC-2/REQ-3 — a reemissão manual é exatamente
    // o caminho que substitui a automação quando ela está desligada; nunca pode checar o campo.
    it('AC-2 (0204): reemite normalmente mesmo com autoEmitEnabled false (reemissão manual nunca olha esse campo)', async () => {
      MockedClient.prototype.emitNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });
      const { service, orderRepository } = setup();

      await service.retryEmission(
        buildOrder({ fiscal: { status: 'rejeitado', rejectedReason: 'Rejeição 704' } }),
        buildConfig({ autoEmitEnabled: false }),
      );

      expect(MockedClient.prototype.emitNfce).toHaveBeenCalled();
      expect(orderRepository.updateFiscal).toHaveBeenLastCalledWith('o-1', { status: 'emitido', ref: 'o-1', documentUrl: '/notas/o-1.html' });
    });
  });

  describe('cancelDocument (REQ-6)', () => {
    it('AC-5: cancela a nota já emitida', async () => {
      MockedClient.prototype.cancelNfce = jest.fn().mockResolvedValue({ ref: 'o-1', status: 'cancelado' });
      const { service, orderRepository } = setup();
      const order = buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', documentUrl: '/notas/o-1.html' } });

      await service.cancelDocument(order, buildConfig(), 'Cliente cancelou o pedido após a emissão');

      expect(MockedClient.prototype.cancelNfce).toHaveBeenCalledWith('o-1', 'Cliente cancelou o pedido após a emissão');
      expect(orderRepository.updateFiscal).toHaveBeenCalledWith('o-1', { status: 'cancelado', ref: 'o-1', documentUrl: '/notas/o-1.html' });
    });

    it('rejeição do cancelamento pela FocusNFe lança (controller decide o HTTP status)', async () => {
      MockedClient.prototype.cancelNfce = jest.fn().mockResolvedValue({ status: 'erro_autorizacao', mensagem_sefaz: 'Fora do prazo de 30 minutos' });
      const { service } = setup();
      const order = buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } });

      await expect(service.cancelDocument(order, buildConfig(), 'Cliente cancelou o pedido após a emissão')).rejects.toThrow('Fora do prazo de 30 minutos');
    });
  });

  describe('applyWebhookResult (REQ-3)', () => {
    it('aplica o resultado assíncrono recebido via webhook ao pedido', async () => {
      const { service, orderRepository } = setup();

      await service.applyWebhookResult('o-1', { ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });

      expect(orderRepository.updateFiscal).toHaveBeenCalledWith('o-1', { status: 'emitido', ref: 'o-1', documentUrl: '/notas/o-1.html' });
    });
  });
});
