/**
 * Acha a sentença inteira (delimitada por `.`/`!`/`?`/quebra de linha/início-fim da string) que
 * contém o placeholder `{nomeContato}` — usado quando não há nome, pra remover a frase toda em
 * vez de deixar o placeholder em branco (ex.: "Vi o {nomeContato} por aqui. " removido por
 * completo, não "Vi o  por aqui.", com espaço duplo/vazio visivelmente quebrado).
 */
const SENTENCE_WITH_PLACEHOLDER = /[^.!?\n]*\{nomeContato\}[^.!?\n]*(?:[.!?]+\s*|\n|$)/g;

/**
 * specs/0124-campanha-whatsapp-prospects REQ-3.1 — substitui o placeholder `{nomeContato}` pelo
 * nome informado (já resolvido por quem chama: `contactName` do prospect, senão
 * `establishmentName`, ou string vazia no envio avulso — REQ-11 — que não tem nenhum nome
 * associado). Domain puro (sem I/O), mesmo padrão de `build-campaign-message.ts`.
 *
 * Achado (20/11/2026) — sem nome (`contactLabel` vazio), não basta apagar só o placeholder: a
 * sentença inteira que o contém é removida, pra não deixar frase quebrada tipo "Vi o  por aqui."
 * no envio (prospect sem nome associado, ou envio avulso pra um número sem contato cadastrado).
 */
export function buildProspectOutreachMessage(template: string, contactLabel: string): string {
  if (contactLabel.length > 0) {
    return template.replaceAll('{nomeContato}', contactLabel);
  }
  return template.replace(SENTENCE_WITH_PLACEHOLDER, '');
}
