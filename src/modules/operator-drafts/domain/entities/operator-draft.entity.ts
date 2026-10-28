import { IOrderItem, PaymentMethod } from '../../../orders/domain/entities/order.entity';

/**
 * specs/0174-pdv-extensao-chrome-lateral — "dois rascunhos sincronizados entre a extensão e o PDV
 * web" (decisão confirmada do usuário, não dois carrinhos só locais). `delivery`/`pickup` mapeiam
 * 1:1 pro `OrderType` já existente em `orders/domain/entities/order.entity.ts`; `counter` (balcão)
 * também finaliza como `OrderType: 'table'` **sem** `tableId` (specs/0120 — balcão compartilha o
 * domínio de mesa, nunca um `OrderType` novo), reaproveitando o `Customer` avulso de balcão em vez
 * de inventar um atendimento anônimo paralelo.
 */
export type OperatorDraftModality = 'delivery' | 'pickup' | 'counter';

/** `'draft'`: editável livremente. `'finalizing'`: claim atômico em andamento (uma finalização já
 * está criando o pedido) — nenhuma segunda finalização pode progredir enquanto este status durar
 * (plan.md §6, "consistência da finalização concorrente"). `'finalized'`: pedido já criado; só
 * resta liberar o espaço (`clear`) pra um pedido novo. */
export type OperatorDraftStatus = 'draft' | 'finalizing' | 'finalized';

export interface IOperatorDraftAdjustment {
  type: 'discount' | 'surcharge';
  mode: 'fixed' | 'percent';
  value: number;
  description?: string;
}

/** De onde partiu a última edição/finalização — só informativo (REQ-22: "rastreabilidade da
 * origem web/extensão"), nunca usado pra autorização. */
export type OperatorDraftOrigin = 'web' | 'extensao';

export interface IOperatorDraft {
  id: string;
  restaurantId: string;
  operatorId: string;
  slot: 1 | 2;
  /** Monotônico, incrementado a cada escrita aceita (`save`/`clear`/claim de finalize) — chave da
   * concorrência otimista (REQ-11/AC-8). */
  revision: number;
  modality: OperatorDraftModality;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNeighborhood?: string;
  items: IOrderItem[];
  notes?: string;
  couponCode?: string;
  adjustment?: IOperatorDraftAdjustment;
  paymentMethod?: PaymentMethod;
  cashChangeFor?: number;
  status: OperatorDraftStatus;
  /** Preenchido só quando `status === 'finalized'`. */
  orderId?: string;
  /** `client-request-id` que ganhou a corrida de finalização deste rascunho (REQ-23) — qualquer
   * outra tentativa de finalizar o MESMO rascunho, com qualquer id, devolve este mesmo pedido em
   * vez de criar um segundo. */
  finalizedClientRequestId?: string;
  lastEditedFrom?: OperatorDraftOrigin;
  updatedAt: string;
}

/** Campos editáveis livremente via `PUT` — nunca inclui `id`/`restaurantId`/`operatorId`/`slot`/
 * `revision`/`status`/`orderId`/`finalizedClientRequestId` (controlados pelo servidor). */
export type OperatorDraftPatch = Pick<
  IOperatorDraft,
  | 'modality'
  | 'items'
> &
  Partial<
    Pick<
      IOperatorDraft,
      | 'customerId'
      | 'customerName'
      | 'customerPhone'
      | 'deliveryAddress'
      | 'deliveryNeighborhood'
      | 'notes'
      | 'couponCode'
      | 'adjustment'
      | 'paymentMethod'
      | 'cashChangeFor'
      | 'lastEditedFrom'
    >
  >;

export function emptyDraftPatch(): OperatorDraftPatch {
  return { modality: 'delivery', items: [] };
}
