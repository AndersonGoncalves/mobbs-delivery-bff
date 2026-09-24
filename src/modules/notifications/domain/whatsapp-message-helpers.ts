import { IOrderItem, IOrderItemSelection, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { PixKeyType } from '../../restaurants/domain/entities/restaurant.entity';

/**
 * specs/0062-confirmar-pedido-whatsapp-restaurante — helpers de formatação de mensagem de
 * WhatsApp compartilhados entre `order-receipt-message-builder.ts` (specs/0013, recibo pro
 * cliente) e `new-order-restaurant-message-builder.ts` (specs/0062, aviso pro restaurante) —
 * extraídos daqui pra não duplicar a lógica de formatação de itens/pagamento nos dois builders.
 */

export interface PaymentBlockRestaurantInput {
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
}

export interface PaymentBlockOrderInput {
  paymentMethod: PaymentMethod;
  orderType: 'delivery' | 'pickup';
}

export interface PaymentBlockInput {
  order: PaymentBlockOrderInput;
  restaurant: PaymentBlockRestaurantInput;
  cardBrand?: string;
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** REQ-9 — mesmo domínio do canal web resolvido em `specs/0009-resolucao-restaurante`
 * (`<slug>.bsdelivery.com.br`), página pública por token (`specs/0006-acompanhamento-pedido`,
 * `/track?token=`), sem exigir login. */
export function buildTrackingLink(slug: string, trackingToken: string): string {
  return `https://${slug}.bsdelivery.com.br/track?token=${trackingToken}`;
}

export function renderSelections(selections: IOrderItemSelection[] | undefined, indent: string): string {
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

export function renderItem(item: IOrderItem): string {
  const lines = [`${item.quantity}x ${item.productName} — ${formatCurrency(item.unitPrice * item.quantity)}`];
  const selections = renderSelections(item.selections, '  ');
  if (selections) lines.push(selections);
  if (item.notes) lines.push(`  Obs.: ${item.notes}`);
  return lines.join('\n');
}

/** specs/0062-confirmar-pedido-whatsapp-restaurante — rótulo simples da forma de pagamento, sem
 * o bloco completo de `buildPaymentBlock` (que reafirma a própria chave Pix do restaurante — faz
 * sentido no recibo pro CLIENTE, não faz sentido pro restaurante, que já sabe qual é a própria
 * chave). Usado só pela mensagem que avisa o restaurante de um pedido novo. */
export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'pix':
      return 'Pix';
    case 'creditCard':
      return 'Cartão de crédito';
    case 'debitCard':
      return 'Cartão de débito';
    case 'cash':
      return 'Dinheiro';
    case 'bankTransfer':
      return 'Transferência bancária';
  }
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

/** REQ-10 — bloco de pagamento varia por método; reforça que o pagamento acontece na
 * entrega/retirada, não pelo app (`docs/architecture/data-model.md`, nota em `Payment`) — **exceto**
 * pra Pix (specs/0020-pix-no-app REQ-7): desde que o Pix passou a ser processado dentro do app
 * (QR/copia-e-cola na tela de acompanhamento, confirmação manual do operador), essa frase deixou
 * de ser verdade só pra esse método; as outras formas continuam mostrando normalmente. */
export function buildPaymentBlock(input: PaymentBlockInput): string {
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

  if (order.paymentMethod !== 'pix') {
    lines.push(`O pagamento é feito na ${order.orderType === 'delivery' ? 'entrega' : 'retirada'}, não pelo app.`);
  }
  return lines.join('\n');
}
