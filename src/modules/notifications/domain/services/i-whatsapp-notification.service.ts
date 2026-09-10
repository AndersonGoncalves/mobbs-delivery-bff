import { IOrder } from '../../../orders/domain/entities/order.entity';

/**
 * specs/0013-notificacoes-whatsapp REQ-1 a REQ-5 — nunca lança pro chamador (REQ-4): falhas de
 * envio/conexão são engolidas e logadas internamente, o fluxo de origem (criação/mudança de
 * status do pedido) nunca é revertido/bloqueado por causa de uma notificação.
 */
export interface IWhatsAppNotificationService {
  /** REQ-1, REQ-6 a REQ-10 — recibo completo na criação do pedido. `cardBrand` não vem do
   * `Order` (fica só no `Payment`), por isso é parâmetro à parte. */
  sendOrderReceipt(order: IOrder, cardBrand?: string): Promise<void>;

  /** REQ-2, REQ-5 — aviso simples numa mudança de status subsequente. */
  sendOrderStatusUpdate(order: IOrder, reason?: string): Promise<void>;
}
