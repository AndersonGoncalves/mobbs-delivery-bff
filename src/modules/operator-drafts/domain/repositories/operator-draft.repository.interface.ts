import { IOperatorDraft, OperatorDraftPatch } from '../entities/operator-draft.entity';

/** Resultado de uma escrita sob concorrência otimista — `ok: false` sempre devolve o estado atual
 * do servidor em `draft` (REQ-11: "sinalizar o conflito à outra, preservando sua edição pra
 * revisão" — a UI decide o que fazer com `draft`, o repositório nunca mescla por suposição). */
export interface OperatorDraftWriteResult {
  ok: boolean;
  draft: IOperatorDraft;
}

export interface IOperatorDraftRepository {
  /** Devolve o rascunho do slot, criando um vazio (revision 0, `status: 'draft'`) se ainda não
   * existir — primeira leitura de uma combinação operador+restaurante+slot nunca é 404 (REQ-8). */
  findOrCreate(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft>;

  findBySlot(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft | null>;

  /**
   * Escrita otimista: só aplica `patch` se a revisão atual no servidor for exatamente
   * `expectedRevision` E o status for `'draft'` (nunca sobrescreve um rascunho em finalização ou
   * já finalizado). Em caso de sucesso, `revision` incrementa em 1.
   */
  save(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number, patch: OperatorDraftPatch): Promise<OperatorDraftWriteResult>;

  /** Limpa o rascunho (REQ-12) — permitido a partir de `'draft'` OU `'finalized'` (libera o espaço
   * pro próximo pedido, REQ-24), nunca a partir de `'finalizing'` (claim em andamento). */
  clear(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult>;

  /**
   * Transição atômica `'draft'` -> `'finalizing'` (claim de finalização, plan.md §6) — só uma
   * chamada concorrente ganha; as demais recebem `ok: false` com o estado atual (que pode já
   * estar `'finalizing'` ou `'finalized'` por outra corrida). Base de REQ-23: nenhum pedido é
   * criado antes deste claim ser vencido.
   */
  tryClaimForFinalize(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult>;

  /** Confirma a finalização depois do pedido criado com sucesso — sempre chamado por quem venceu
   * o claim, portanto incondicional (sem checagem de revisão: já é dono exclusivo do rascunho). */
  markFinalized(restaurantId: string, operatorId: string, slot: 1 | 2, orderId: string, clientRequestId: string): Promise<IOperatorDraft>;

  /** Desfaz o claim (volta pra `'draft'`) quando a criação do pedido falha depois do claim vencido
   * — devolve o rascunho pro operador tentar de novo, sem perder os dados (REQ-24: "falha de
   * criação deve manter o rascunho"). */
  rollbackClaim(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft>;
}
