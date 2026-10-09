/**
 * specs/0124-campanha-whatsapp-prospects REQ-3.1 — substitui o placeholder `{nomeContato}` pelo
 * nome informado (já resolvido por quem chama: `contactName` do prospect, senão
 * `establishmentName`, ou string vazia no envio avulso — REQ-11 — que não tem nenhum nome
 * associado). Domain puro (sem I/O), mesmo padrão de `build-campaign-message.ts`.
 */
export function buildProspectOutreachMessage(template: string, contactLabel: string): string {
  return template.replaceAll('{nomeContato}', contactLabel);
}
