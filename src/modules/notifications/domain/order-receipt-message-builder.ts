import { IOrder, IOrderItem, IOrderItemSelection } from '../../orders/domain/entities/order.entity';
import { PixKeyType } from '../../restaurants/domain/entities/restaurant.entity';

export interface OrderReceiptRestaurantInput {
  name: string;
  slug: string;
  orderConfirmationGreeting?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
}

export interface OrderReceiptCustomerInput {
  name: string;
}

export interface OrderReceiptInput {
  restaurant: OrderReceiptRestaurantInput;
  customer: OrderReceiptCustomerInput;
  order: IOrder;
  /** `Order` não guarda `cardBrand` (fica só no `Payment`, registro separado) — quem monta o
   * recibo (`WhatsAppNotificationService`) já tem esse dado à mão no momento da criação do
   * pedido (mesmo corpo da requisição), então passa aqui em vez de fazer outra consulta. */
  cardBrand?: string;
}

const DEFAULT_GREETING = 'Obrigado por pedir com a gente, {customerName}!';

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** REQ-7/REQ-8 — só a saudação é editável pelo restaurante; o resto do recibo nunca é. */
function buildGreeting(template: string | undefined, customerName: string): string {
  return (template ?? DEFAULT_GREETING).replace('{customerName}', customerName);
}

/** REQ-9 — mesmo domínio do canal web resolvido em `specs/0009-resolucao-restaurante`
 * (`<slug>.bsdelivery.com.br`), página pública por token (`specs/0006-acompanhamento-pedido`,
 * `/track?token=`), sem exigir login. */
function buildTrackingLink(slug: string, trackingToken: string): string {
  return `https://${slug}.bsdelivery.com.br/track?token=${trackingToken}`;
}

function renderSelections(selections: IOrderItemSelection[] | undefined, indent: string): string {
  if (!selections || selections.length === 0) return '';
  return selections
    .map((selection) => {
      const priceSuffix = selection.priceDelta > 0 ? ` (+${formatCurrency(selection.priceDelta)})` : '';
      const line = `${indent}+ ${selection.optionName}${priceSuffix}`;
      const nested = renderSelections(selection.nestedSelections, `${indent}  `);
      return nested ? `${line}\n${nested}` : line;
    })
    .join('\n');
}

function renderItem(item: IOrderItem): string {
  const lines = [`${item.quantity}x ${item.productName} — ${formatCurrency(item.unitPrice * item.quantity)}`];
  const selections = renderSelections(item.selections, '  ');
  if (selections) lines.push(selections);
  if (item.notes) lines.push(`  Obs.: ${item.notes}`);
  return lines.join('\n');
}

/** REQ-10 — bloco de pagamento varia por método; sempre reforça que o pagamento acontece na
 * entrega/retirada, não pelo app (`docs/architecture/data-model.md`, nota em `Payment`). */
function buildPaymentBlock(input: OrderReceiptInput): string {
  const { order, restaurant, cardBrand } = input;
  const lines = ['*Pagamento*'];

  switch (order.paymentMethod) {
    case 'pix':
      lines.push('Forma: Pix');
      if (restaurant.pixKey) {
        lines.push(`Chave Pix (${pixKeyTypeLabel(restaurant.pixKeyType)}): ${restaurant.pixKey}`);
      }
      if (restaurant.pixBeneficiaryName) {
        lines.push(`Beneficiário: ${restaurant.pixBeneficiaryName}`);
      }
      break;
    case 'creditCard':
      lines.push(`Forma: Cartão de crédito${cardBrand ? ` (${cardBrand})` : ''}`);
      break;
    case 'debitCard':
      lines.push(`Forma: Cartão de débito${cardBrand ? ` (${cardBrand})` : ''}`);
      break;
    case 'cash':
      lines.push('Forma: Dinheiro');
      break;
    case 'bankTransfer':
      lines.push('Forma: Transferência bancária');
      break;
  }

  lines.push(`O pagamento é feito na ${order.orderType === 'delivery' ? 'entrega' : 'retirada'}, não pelo app.`);
  return lines.join('\n');
}

function pixKeyTypeLabel(type: PixKeyType | undefined): string {
  switch (type) {
    case 'telefone':
      return 'telefone';
    case 'cpf':
      return 'CPF';
    case 'cnpj':
      return 'CNPJ';
    case 'email':
      return 'e-mail';
    case 'aleatoria':
      return 'aleatória';
    default:
      return 'chave';
  }
}

/**
 * specs/0013-notificacoes-whatsapp REQ-1/REQ-6 a REQ-10 — recibo detalhado enviado na criação do
 * pedido. Domain puro (sem I/O), testável sem sessão de WhatsApp/Mongo real.
 *
 * `deliveryAddress` é um texto livre (não estruturado com bairro/complemento/telefone
 * separados) — simplificação já existente em `IOrder` (`docs/architecture/data-model.md`, nota
 * em `Order`), não uma decisão desta spec; o bloco de entrega usa o texto como veio.
 */
export function buildOrderReceiptMessage(input: OrderReceiptInput): string {
  const { restaurant, customer, order } = input;

  const lines: string[] = [
    buildGreeting(restaurant.orderConfirmationGreeting, customer.name),
    '',
    `*Pedido #${order.orderNumber}*`,
    `Acompanhe: ${buildTrackingLink(restaurant.slug, order.trackingToken)}`,
    '',
    '*Itens*',
    ...order.items.map(renderItem),
    '',
    `Subtotal: ${formatCurrency(order.subtotal)}`,
  ];

  if (order.orderType === 'delivery') {
    lines.push('', '*Entrega*', `Para: ${customer.name}`, `Endereço: ${order.deliveryAddress ?? 'não informado'}`);
    lines.push(`Taxa de entrega: ${formatCurrency(order.deliveryFee)}`);
  } else {
    lines.push('', 'Retirada no local.');
  }

  if (order.estimatedDeliveryAt) {
    lines.push(`Previsão: ${new Date(order.estimatedDeliveryAt).toLocaleString('pt-BR')}`);
  }

  if (order.discount > 0) {
    lines.push(`Desconto: -${formatCurrency(order.discount)}`);
  }

  lines.push(`*Total: ${formatCurrency(order.total)}*`, '', buildPaymentBlock(input));

  return lines.join('\n');
}
