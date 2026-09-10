/**
 * specs/0014-financeiro REQ-5 — entrada usada pelo módulo `orders` ao marcar um pedido como
 * entregue/retirado. Deliberadamente **não** importa `IOrder` (`modules/orders/domain/entities`)
 * pra não criar uma dependência circular entre os dois módulos (orders -> este serviço,
 * financeiro -> nada de orders) — mesmo raciocínio de inversão de dependência já aplicado entre
 * módulos Flutter (`.claude/skills/add-module`), adaptado pro BFF: o módulo provedor do serviço
 * (financeiro) expõe a interface (mesmo padrão de `IWhatsAppNotificationService`, definida em
 * `notifications` e consumida por `orders`), mas com um DTO próprio em vez do tipo de domínio do
 * chamador.
 */
export interface AutomaticCashEntryInput {
  restaurantId: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  /**
   * Comparado com `'pix'` dentro da implementação — recebido como `string` (não o enum
   * `PaymentMethod` de `orders/domain/entities`) justamente pra não importar esse módulo aqui.
   */
  paymentMethod: string;
}

/**
 * REQ-5 — nunca lança pro chamador: se o método de pagamento não for `pix`, ou não houver sessão
 * de caixa aberta no restaurante, simplesmente não lança nada (não força abertura automática de
 * caixa, decisão confirmada em `spec.md`).
 */
export interface ICashRegisterService {
  addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void>;
}
