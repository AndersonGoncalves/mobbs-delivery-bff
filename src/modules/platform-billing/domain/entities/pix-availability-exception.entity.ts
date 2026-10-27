/**
 * specs/0175-cobranca-assinatura-asaas REQ-10 (decisão de negócio 10) — exceção de 3 dias
 * corridos quando a plataforma só consegue disponibilizar um Pix válido DEPOIS do vencimento
 * comercial, por falha exclusivamente dela (nunca por cadastro incompleto do pagador nem outro
 * bloqueio independente). Um registro por obligation, criado UMA ÚNICA VEZ (`createIfAbsent`,
 * `$setOnInsert`) — retentativas/reprocessamentos posteriores nunca renovam a janela (AC-5).
 *
 * `graceDeadline` desloca só o CORTE de bloqueio (`recomputeAccessStatus`); a dívida financeira
 * exibida ao lojista continua mostrando `obligation.dueDate` original, nunca esta data (REQ-10
 * "sem alterar o vencimento financeiro").
 */
export interface IPixAvailabilityException {
  id: string;
  obligationId: string;
  firstValidPixAvailableAt: Date;
  graceDeadline: Date;
  createdAt: Date;
}
