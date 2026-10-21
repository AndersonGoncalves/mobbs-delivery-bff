import { IOrderRepository } from '../repositories/order.repository.interface';
import { IPaymentRepository } from '../repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../../notifications/domain/services/i-whatsapp-notification.service';
import { IOrder, PaymentMethod } from '../entities/order.entity';
import { ConfirmOnlinePaymentService } from './confirm-online-payment.service';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1', orderNumber: 1, trackingToken: 'track-1', customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'aguardandoConfirmacao', statusHistory: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30,
    paymentMethod: 'pix', createdAt: new Date().toISOString(), ...overrides,
  };
}

function buildPayment(overrides: Record<string, unknown> = {}) {
  return { id: 'pay-1', orderId: 'o-1', method: 'pix', status: 'pendente', amount: 30, ...overrides };
}

/**
 * specs/0170-integracao-mercado-pago T002/T021 — suíte renomeada/estendida: `ConfirmPixPaymentService`
 * virou `ConfirmOnlinePaymentService`, generalizando `autoConfirmPaymentMethods?.includes('pix')`
 * (hardcoded) pra `autoConfirmPaymentMethods?.includes(order.paymentMethod)` — cobre tanto Pix
 * quanto `creditCardOnline` (Mercado Pago) com o mesmo comportamento, exceto a mensagem de
 * WhatsApp "Pix confirmado" (específica do Pix, nunca disparada pra cartão online).
 */
describe('ConfirmOnlinePaymentService', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    paymentRepository?: Partial<IPaymentRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    whatsAppNotificationService?: Partial<IWhatsAppNotificationService>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      updateStatus: jest.fn().mockImplementation((id, status) => Promise.resolve(buildOrder({ id, status }))),
      ...overrides.orderRepository,
    };
    const paymentRepository: Partial<IPaymentRepository> = {
      markAsApproved: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })),
      ...overrides.paymentRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Prime Pizza', autoConfirmPaymentMethods: [] }),
      ...overrides.restaurantRepository,
    };
    const whatsAppNotificationService: Partial<IWhatsAppNotificationService> = {
      sendPaymentConfirmedMessage: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
      ...overrides.whatsAppNotificationService,
    };
    const service = new ConfirmOnlinePaymentService(
      paymentRepository as IPaymentRepository,
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      whatsAppNotificationService as IWhatsAppNotificationService,
    );
    return { service, orderRepository, paymentRepository, restaurantRepository, whatsAppNotificationService };
  }

  it.each<PaymentMethod>(['pix', 'creditCardOnline'])('marca o pagamento %s como aprovado', async (method) => {
    const { service, paymentRepository } = setup();

    await service.confirm(buildOrder({ paymentMethod: method }));

    expect(paymentRepository.markAsApproved).toHaveBeenCalledWith('o-1');
  });

  it('envia a mensagem "Pix confirmado" só pra pix, nunca pra creditCardOnline', async () => {
    const { service: pixService, whatsAppNotificationService: pixWhatsApp } = setup();
    await pixService.confirm(buildOrder({ paymentMethod: 'pix' }));
    expect(pixWhatsApp.sendPaymentConfirmedMessage).toHaveBeenCalledTimes(1);

    const { service: cardService, whatsAppNotificationService: cardWhatsApp } = setup();
    await cardService.confirm(buildOrder({ paymentMethod: 'creditCardOnline' }));
    expect(cardWhatsApp.sendPaymentConfirmedMessage).not.toHaveBeenCalled();
  });

  it.each<PaymentMethod>(['pix', 'creditCardOnline'])(
    '%s em autoConfirmPaymentMethods avança o pedido aguardandoConfirmacao -> confirmado e notifica',
    async (method) => {
      const { service, orderRepository, restaurantRepository, whatsAppNotificationService } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', autoConfirmPaymentMethods: [method] }) },
      });

      const { order } = await service.confirm(buildOrder({ paymentMethod: method, status: 'aguardandoConfirmacao' }));

      expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'confirmado', 'r-1');
      expect(order.status).toBe('confirmado');
      expect(whatsAppNotificationService.sendOrderStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmado' }));
      expect(restaurantRepository.findById).toHaveBeenCalledWith('r-1');
    },
  );

  it('sem o método em autoConfirmPaymentMethods, não avança o status', async () => {
    const { service, orderRepository } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', autoConfirmPaymentMethods: ['cash'] }) },
    });

    const { order } = await service.confirm(buildOrder({ paymentMethod: 'creditCardOnline', status: 'aguardandoConfirmacao' }));

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(order.status).toBe('aguardandoConfirmacao');
  });

  it('pedido que não está mais aguardandoConfirmacao não é avançado de novo', async () => {
    const { service, orderRepository } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue({ id: 'r-1', autoConfirmPaymentMethods: ['creditCardOnline'] }) },
    });

    await service.confirm(buildOrder({ paymentMethod: 'creditCardOnline', status: 'confirmado' }));

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });
});
