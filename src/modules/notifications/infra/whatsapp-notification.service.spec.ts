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
      restaurant?: { id: string; name: string; slug: string; whatsappConnected: boolean } | null;
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
  });
});
