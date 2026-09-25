import { IOrderItem, IOrderItemSelection, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { environment } from '../../../shared/config/environment';

/**
 * specs/0062-confirmar-pedido-whatsapp-restaurante — helpers de formatação de mensagem de
 * WhatsApp compartilhados entre `order-receipt-message-builder.ts` (specs/0013, recibo pro
 * cliente) e `new-order-restaurant-message-builder.ts` (specs/0062, aviso pro restaurante) —
 * extraídos daqui pra não duplicar a lógica de formatação de itens/pagamento nos dois builders.
 */

export interface PaymentBlockOrderInput {
  paymentMethod: PaymentMethod;
  orderType: 'delivery' | 'pickup';
}

export interface PaymentBlockInput {
  order: PaymentBlockOrderInput;
  cardBrand?: string;
  /** copia-e-cola Pix já montado (`buildOrderPixCode`); ausente = só "Forma: Pix". */
  pixCode?: string;
  /** `specs/0073` — o código vai numa mensagem SEPARADA (só o código, pra copiar com um toque): o
   * bloco só avisa "na mensagem abaixo 👇" em vez de repetir o código. */
  pixCodeSentSeparately?: boolean;
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Substitui `{chave}` por valor nos templates editáveis na retaguarda (chaves em português, ver
 * `message-placeholders.ts`). Chave desconhecida fica literal. **Linha cujos placeholders
 * resultaram todos vazios é omitida** (ex.: "Previsão: {previsaoEntrega}" sem previsão, ou
 * "Desconto: {desconto}" sem desconto) — o template pode ter linhas opcionais sem deixar rótulo
 * solto na mensagem.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const lines = template.split('\n').flatMap((line) => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).filter((key) => key in values);
    if (keys.length > 0 && keys.every((key) => values[key] === '')) return [];
    // Passada única: um valor que contenha "{...}" (ex.: nome do cliente) nunca é re-substituído.
    return [line.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match))];
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Template salvo em branco (operador apagou o campo e salvou) conta como "não configurado" —
 * usa o padrão em vez de mandar mensagem vazia pro cliente. */
export function resolveTemplate(template: string | undefined, fallback: string): string {
  return template && template.trim() !== '' ? template : fallback;
}

/** Link público de acompanhamento (`specs/0006`): `<origem>/<slug>/track?token=` — o app do
 * cliente é servido por slug em path (`bsdelivery.com.br/<slug>`), não por subdomínio. A origem
 * vem de `PUBLIC_APP_BASE_URL` (`specs/0069`). */
export function buildTrackingLink(slug: string, trackingToken: string, baseUrl: string = environment.publicApp.baseUrl): string {
  return `${baseUrl.replace(/\/+$/, '')}/${slug}/track?token=${trackingToken}`;
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

/** REQ-10 — bloco de pagamento varia por método; reforça que o pagamento acontece na
 * entrega/retirada, não pelo app — **exceto** pra Pix (specs/0020-pix-no-app REQ-7). `specs/0069`:
 * o Pix mostra o copia-e-cola do pedido (o mesmo da tela do app), nunca a chave crua; `specs/0073`:
 * no recibo o código vai numa 2ª mensagem só com ele. */
export function buildPaymentBlock(input: PaymentBlockInput): string {
  const { order, cardBrand, pixCode, pixCodeSentSeparately } = input;
  const lines = ['*Pagamento*'];

  switch (order.paymentMethod) {
    case 'pix':
      lines.push('Forma: Pix');
      if (pixCode) {
        lines.push(pixCodeSentSeparately ? 'Pix copia e cola: na mensagem abaixo 👇' : `Pix copia e cola:\n${pixCode}`);
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
