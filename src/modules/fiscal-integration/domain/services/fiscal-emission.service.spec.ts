import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
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

function buildConfig(overrides: Partial<IFiscalConfig> = {}): IFiscalConfig {
  return {
    restaurantId: 'r-1',
    focusNfeToken: 'token-1',
    environment: 'homologacao',
    documentType: 'nfce',
    productionEnabled: false,
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
