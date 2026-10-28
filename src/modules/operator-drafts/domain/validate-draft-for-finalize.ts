import { BadRequestError } from 'restify-errors';

import { IOrderItem, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { OperatorDraftModality } from './entities/operator-draft.entity';

export interface DraftFinalizeInput {
  modality: OperatorDraftModality;
  items: IOrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  paymentMethod?: PaymentMethod;
}

/**
 * specs/0174-pdv-extensao-chrome-lateral REQ-13/AC-9 — "Delivery exige cliente identificado,
 * telefone válido, endereço [...]; Retirada exige nome e telefone, sem taxa de entrega; Balcão
 * permite venda sem identificação, sem endereço nem taxa de entrega." Função pura (sem I/O),
 * mesma filosofia de `validateCoupon`/`compute-order-pricing.ts` — fácil de testar sem mocks de
 * repositório. A taxa de entrega em si (zero em pickup/counter) é garantida por
 * `resolveDeliveryFee`, não aqui; esta função só valida os campos de identificação do cliente.
 */
export function validateDraftForFinalize(input: DraftFinalizeInput): void {
  if (input.items.length === 0) {
    throw new BadRequestError('Adicione ao menos um item ao pedido antes de finalizar');
  }
  if (!input.paymentMethod) {
    throw new BadRequestError('Selecione uma forma de pagamento');
  }

  if (input.modality === 'delivery') {
    if (!input.customerName) throw new BadRequestError('Informe o nome do cliente para delivery');
    if (!input.customerPhone) throw new BadRequestError('Informe o telefone do cliente para delivery');
    if (!input.deliveryAddress) throw new BadRequestError('Informe o endereço de entrega para delivery');
    return;
  }

  if (input.modality === 'pickup') {
    if (!input.customerName) throw new BadRequestError('Informe o nome do cliente para retirada');
    if (!input.customerPhone) throw new BadRequestError('Informe o telefone do cliente para retirada');
    return;
  }

  // 'counter' (balcão) — REQ-13: venda sem identificação é permitida, sem endereço nem taxa.
}
