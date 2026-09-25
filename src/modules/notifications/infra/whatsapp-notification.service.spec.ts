import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { WhatsAppNotificationService } from './whatsapp-notification.service';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 123,
    trackingToken: 'abc123',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'X-Burger', quantity: 1, unitPrice: 25 }],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    status: 'aguardandoConfirmacao',
    statusHistory: [],
    subtotal: 25,
    deliveryFee: 5,
    discount: 0,
    total: 30,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WhatsAppNotificationService', () => {
  function setup(
    overrides: {
      customer?: { id: string; name: string; phone?: string } | null;
      restaurant?:
        | { id: string; name: string; slug: string; whatsappConnected: boolean; notifyCustomerOnOrderConfirmed?: boolean; orderConfirmedWhatsAppTemplate?: string; notifyCustomerOnPixConfirmed?: boolean; pixConfirmedWhatsAppTemplate?: string; notifyCustomerOnOrderCreated?: boolean; orderReceiptWhatsAppTemplate?: string; notifyCustomerOnOrderOutForDelivery?: boolean; orderOutForDeliveryWhatsAppTemplate?: string; notifyCustomerOnOrderPreparing?: boolean; orderPreparingWhatsAppTemplate?: string; notifyCustomerOnOrderCancelled?: boolean; orderCancelledWhatsAppTemplate?: string; pixKey?: string }
        | null;
    } = {},
  ) {
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest
        .fn()
        .mockResolvedValue(
          overrides.customer === null
            ? null
            : (overrides.customer ?? { id: 'c-1', name: 'Ana', email: 'ana@example.com', phone: '11999999999' }),
        ),
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest
        .fn()
        .mockResolvedValue(
          overrides.restaurant === null
            ? null
            : (overrides.restaurant ?? {
                id: 'r-1',
                name: 'Prime Pizza',
                slug: 'primepizza',
                isActive: true,
                businessHours: [],
                minimumOrderValue: 0,
                deliveryFeeCents: 0,
                whatsappConnected: true,
              }),
        ),
    };
    const whatsAppConnectionService: Partial<IWhatsAppConnectionService> = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WhatsAppNotificationService(
      whatsAppConnectionService as IWhatsAppConnectionService,
      customerRepository as ICustomerRepository,
      restaurantRepository as IRestaurantRepository,
    );

    return { service, customerRepository, restaurantRepository, whatsAppConnectionService };
  }

  describe('sendOrderReceipt', () => {
    it('AC-1: envia o recibo pro telefone do cliente quando conectado', async () => {
      const { service, whatsAppConnectionService } = setup();

      await service.sendOrderReceipt(buildOrder());

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith(
        'r-1',
        '11999999999',
        expect.stringContaining('#123'),
      );
    });

    it('specs/0069: notifyCustomerOnOrderCreated false não envia o recibo', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderCreated: false },
      });

      await service.sendOrderReceipt(buildOrder());

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('specs/0069: usa orderReceiptWhatsAppTemplate do restaurante quando configurado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: {
          id: 'r-1',
          name: 'Prime Pizza',
          slug: 'primepizza',
          whatsappConnected: true,
          orderReceiptWhatsAppTemplate: 'Recibo {numeroPedido} de {nomeCliente}: {total}',
        },
      });

      await service.sendOrderReceipt(buildOrder());

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Recibo 123 de Ana: R$ 30,00');
    });

    it('specs/0069: recibo de pedido Pix leva o copia-e-cola e não a chave Pix crua do restaurante', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, pixKey: '81507020325' },
      });

      await service.sendOrderReceipt(buildOrder({ paymentMethod: 'pix' }));

      const message = (whatsAppConnectionService.sendMessage as jest.Mock).mock.calls[0][2] as string;
      expect(message).toContain('Pix copia e cola:\n000201');
      expect(message).not.toContain('Chave Pix');
      expect(message).not.toContain('Beneficiário');
    });

    it('AC-3: pula o envio quando o cliente não tem telefone', async () => {
      const { service, whatsAppConnectionService } = setup({ customer: { id: 'c-1', name: 'Ana', phone: undefined } });

      await service.sendOrderReceipt(buildOrder());

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('AC-9: pula o envio quando o restaurante não tem WhatsApp conectado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: false },
      });

      await service.sendOrderReceipt(buildOrder());

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('specs/0066 AC-3: cliente sem telefone loga o motivo (não fica silencioso)', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { service } = setup({ customer: { id: 'c-1', name: 'Ana', phone: undefined } });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cliente sem telefone'));
      warn.mockRestore();
    });

    it('specs/0066 AC-3: restaurante sem WhatsApp conectado loga o motivo (não fica silencioso)', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { service } = setup({ restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: false } });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('não está conectado'));
      warn.mockRestore();
    });

    it('AC-4: uma falha no envio não propaga (nunca lança)', async () => {
      const { service, whatsAppConnectionService } = setup();
      (whatsAppConnectionService.sendMessage as jest.Mock).mockRejectedValue(new Error('sessão caiu'));

      await expect(service.sendOrderReceipt(buildOrder())).resolves.toBeUndefined();
    });
  });

  describe('sendOrderStatusUpdate', () => {
    it('AC-2: envia a mensagem de status pro telefone do cliente', async () => {
      const { service, whatsAppConnectionService } = setup();

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith(
        'r-1',
        '11999999999',
        expect.stringContaining('#123'),
      );
    });

    it('AC-3: pula quando o cliente não tem telefone', async () => {
      const { service, whatsAppConnectionService } = setup({ customer: { id: 'c-1', name: 'Ana', phone: undefined } });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('AC-4: uma falha no envio não propaga', async () => {
      const { service, whatsAppConnectionService } = setup();
      (whatsAppConnectionService.sendMessage as jest.Mock).mockRejectedValue(new Error('sessão caiu'));

      await expect(service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }))).resolves.toBeUndefined();
    });

    // specs/0063-notificacao-whatsapp-pedido-confirmado REQ-3/REQ-4/AC-2/AC-3.
    it('AC-3: notifyCustomerOnOrderConfirmed false pula o envio quando status é confirmado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderConfirmed: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('notifyCustomerOnOrderConfirmed false não afeta outros status (ex.: entregue continua enviando)', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderConfirmed: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'entregue' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', expect.stringContaining('#123'));
    });

    it('specs/0065 AC-3: notifyCustomerOnOrderOutForDelivery false pula o envio quando status é saiuParaEntrega', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderOutForDelivery: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'saiuParaEntrega' }));

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('specs/0065: desligar "saiu para entrega" não afeta "confirmado" (toggles independentes)', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderOutForDelivery: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', expect.stringContaining('#123'));
    });

    it('specs/0065 AC-2: usa orderOutForDeliveryWhatsAppTemplate do restaurante quando configurado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: {
          id: 'r-1',
          name: 'Prime Pizza',
          slug: 'primepizza',
          whatsappConnected: true,
          orderOutForDeliveryWhatsAppTemplate: 'Oi {nomeCliente}, o pedido #{numeroPedido} saiu!',
        },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'saiuParaEntrega' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Oi Ana, o pedido #123 saiu!');
    });

    it('specs/0065 AC-4: sem template configurado envia o texto fixo de sempre', async () => {
      const { service, whatsAppConnectionService } = setup();

      await service.sendOrderStatusUpdate(buildOrder({ status: 'saiuParaEntrega' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Seu pedido #123 saiu para entrega!');
    });

    it('specs/0071: notifyCustomerOnOrderPreparing false não envia em "emPreparo"', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderPreparing: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'emPreparo' }));

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('specs/0071: usa orderPreparingWhatsAppTemplate quando configurado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, orderPreparingWhatsAppTemplate: 'Na chapa! #{numeroPedido}' },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'emPreparo' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Na chapa! #123');
    });

    it('specs/0071: notifyCustomerOnOrderCancelled false não envia em "cancelado", mas os outros status seguem', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnOrderCancelled: false },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'cancelado' }), 'sem estoque');
      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();

      await service.sendOrderStatusUpdate(buildOrder({ status: 'emPreparo' }));
      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('specs/0071: cancelamento usa orderCancelledWhatsAppTemplate com {motivoCancelamento}', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: {
          id: 'r-1',
          name: 'Prime Pizza',
          slug: 'primepizza',
          whatsappConnected: true,
          orderCancelledWhatsAppTemplate: 'Cancelado #{numeroPedido}: {motivoCancelamento}',
        },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'cancelado' }), 'sem estoque');

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Cancelado #123: sem estoque');
    });

    it('AC-2: usa orderConfirmedWhatsAppTemplate do restaurante quando configurado', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: {
          id: 'r-1',
          name: 'Prime Pizza',
          slug: 'primepizza',
          whatsappConnected: true,
          orderConfirmedWhatsAppTemplate: 'Oi {nomeCliente}, pedido #{numeroPedido} confirmado!',
        },
      });

      await service.sendOrderStatusUpdate(buildOrder({ status: 'confirmado' }));

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Oi Ana, pedido #123 confirmado!');
    });
  });

  describe('sendPaymentConfirmedMessage (specs/0064)', () => {
    it('AC-4: sem template configurado envia exatamente "Pagamento confirmado!"', async () => {
      const { service, whatsAppConnectionService } = setup();

      await service.sendPaymentConfirmedMessage(buildOrder());

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Pagamento confirmado!');
    });

    it('AC-2: usa pixConfirmedWhatsAppTemplate do restaurante, com placeholders substituídos', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: {
          id: 'r-1',
          name: 'Prime Pizza',
          slug: 'primepizza',
          whatsappConnected: true,
          pixConfirmedWhatsAppTemplate: 'Oi {nomeCliente}, Pix do pedido #{numeroPedido} recebido!',
        },
      });

      await service.sendPaymentConfirmedMessage(buildOrder());

      expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledWith('r-1', '11999999999', 'Oi Ana, Pix do pedido #123 recebido!');
    });

    it('AC-3: notifyCustomerOnPixConfirmed false não envia nada', async () => {
      const { service, whatsAppConnectionService } = setup({
        restaurant: { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', whatsappConnected: true, notifyCustomerOnPixConfirmed: false },
      });

      await service.sendPaymentConfirmedMessage(buildOrder());

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('cliente sem telefone: não envia (e loga o motivo)', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { service, whatsAppConnectionService } = setup({ customer: { id: 'c-1', name: 'Ana', phone: undefined } });

      await service.sendPaymentConfirmedMessage(buildOrder());

      expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    });

    it('uma falha no envio não propaga (nunca lança)', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { service, whatsAppConnectionService } = setup();
      (whatsAppConnectionService.sendMessage as jest.Mock).mockRejectedValue(new Error('offline'));

      await expect(service.sendPaymentConfirmedMessage(buildOrder())).resolves.toBeUndefined();
    });
  });
});
