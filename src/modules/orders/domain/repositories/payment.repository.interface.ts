import { IPayment } from '../entities/order.entity';

/**
 * specs/0020-pix-no-app — primeiro consumidor real de `Payment` (coleção Mongo já existia desde
 * `specs/0005-checkout`/`OrderMongooseRepository.create()`, mas nunca tinha repository/use case
 * próprio; a retaguarda só lia o extrato do banco por fora do sistema). Amplia o módulo `orders`
 * existente — não é um módulo `Payment` novo.
 */
export interface IPaymentRepository {
  findByOrderId(orderId: string): Promise<IPayment | null>;

  /** REQ-5/REQ-6 — evita N+1 ao listar pedidos (`GET /orders`, `GET /restaurants/me/orders`). */
  findManyByOrderIds(orderIds: string[]): Promise<IPayment[]>;

  /**
   * REQ-4 — confirmação manual do operador (`PATCH .../payment/confirm`); quem decide **se** a
   * transição é permitida (método `pix`, status atual `pendente`) é o controller, mesmo padrão de
   * `IOrderRepository.updateStatus` — este método só aplica a mudança.
   */
  markAsApproved(orderId: string): Promise<IPayment>;
}
