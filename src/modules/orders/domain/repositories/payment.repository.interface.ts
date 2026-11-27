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

  /** specs/0226 REQ-B3 — passa pra `aprovado` SÓ se ainda estiver `pendente`, numa operação
   * atômica; devolve `null` se outro aviso já tiver aprovado (o Mercado Pago avisa o mesmo Pix
   * pelos tópicos `payment` e `order`, às vezes ao mesmo tempo — sem isso, confirmaria duas vezes). */
  markAsApprovedIfPending(orderId: string): Promise<IPayment | null>;

  /** specs/0226 REQ-A19 — cartão online recusado: passa pra `recusado` SÓ se ainda estiver `pendente`
   * (aviso de recusa atrasado nunca desfaz um pagamento já aprovado); `null` se não mudou. */
  markAsRefusedIfPending(orderId: string): Promise<IPayment | null>;

  /** specs/0226 REQ-B1 — persiste o id da order Pix e o copia e cola devolvidos pelo Mercado Pago
   * na criação do pedido (`provider: 'mercadopago'`). */
  setMercadoPagoPixDetails(orderId: string, data: { externalReference: string; pixPayload: string }): Promise<IPayment>;

  /** specs/0101-integracao-asaas (fase 1) — persiste o id da cobrança e o copia-e-cola devolvidos
   * pelo Asaas na criação do pedido (`OrdersController.create`). */
  setAsaasPixDetails(orderId: string, data: { externalReference: string; pixPayload: string }): Promise<IPayment>;

  /** specs/0101-integracao-asaas (fase 1) — cancelamento de um pedido cujo Pix via Asaas já
   * tinha sido aprovado (`OrdersController`, os 2 handlers de cancelamento). */
  markAsRefunded(orderId: string): Promise<IPayment>;

  /** specs/0170-integracao-mercado-pago — persiste o id da preferência e a URL de checkout
   * devolvidos pelo Mercado Pago na criação do pedido (`OrdersController.create`). */
  setMercadoPagoCheckoutDetails(orderId: string, data: { externalReference: string; checkoutUrl: string }): Promise<IPayment>;

  /** specs/0101-integracao-asaas (fase 2) — persiste o id do checkout e a URL hospedada
   * devolvidos pelo Asaas na criação do pedido (`OrdersController.create`), mesmo padrão de
   * `setMercadoPagoCheckoutDetails`. */
  setAsaasCheckoutDetails(orderId: string, data: { externalReference: string; checkoutUrl: string }): Promise<IPayment>;

  /** specs/0101-integracao-asaas (fase 2) — depois que o webhook confirma um checkout pago
   * (`CHECKOUT_PAID`), `externalReference` é sobrescrito do id do CHECKOUT (usado só até ali) pro
   * id do PAGAMENTO real (`AsaasClient.findPaymentByExternalReference`) — estorno
   * (`POST /v3/payments/:id/refund`) opera sobre pagamento, nunca sobre checkout. */
  updateExternalReference(orderId: string, externalReference: string): Promise<IPayment>;

  /** specs/0226 REQ-A15 — números dos pedidos ainda abertos (nem entregues nem cancelados) do
   * restaurante com pagamento do Mercado Pago pendente; bloqueia o "Desvincular" enquanto houver. */
  findOpenOrderNumbersWithPendingMercadoPagoPayment(restaurantId: string): Promise<number[]>;
}
