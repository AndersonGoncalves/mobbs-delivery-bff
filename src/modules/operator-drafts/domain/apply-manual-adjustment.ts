import { BadRequestError } from 'restify-errors';

import { IOperatorDraftAdjustment } from './entities/operator-draft.entity';

/**
 * specs/0174-pdv-extensao-chrome-lateral REQ-18/AC-12/AC-14 — aplica o ajuste manual (fixo ou
 * percentual, desconto ou acréscimo) sobre o total já com taxa de entrega e cupom aplicados
 * (`computeOrderPricing`, `orders/domain/compute-order-pricing.ts` — nunca reimplementado aqui).
 * Mesmo papel de `calculateTotals` em `table-service/domain/services/table-order.service.ts`,
 * mas função pura isolada (sem side-effects de mesa/comanda) pra reaproveitar entre PDV
 * web/extensão sem puxar o motor de mesa inteiro.
 *
 * "Total negativo é rejeitado" (AC-12) — diferente do balcão/mesa, que às vezes arredonda pra
 * zero, aqui o pedido explícito da spec é rejeitar com erro explícito, nunca truncar em silêncio.
 */
export function applyManualAdjustment(baseTotal: number, adjustment?: IOperatorDraftAdjustment): number {
  if (!adjustment) return baseTotal;

  const amount = adjustment.mode === 'percent' ? (baseTotal * adjustment.value) / 100 : adjustment.value;
  const signedAmount = adjustment.type === 'surcharge' ? amount : -amount;
  const total = baseTotal + signedAmount;

  if (total < 0) {
    throw new BadRequestError('O ajuste manual não pode deixar o total negativo');
  }
  return Math.round(total * 100) / 100;
}
