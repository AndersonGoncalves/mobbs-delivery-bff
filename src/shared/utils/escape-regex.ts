// specs/0026-selecao-clonar-excluir-busca-web REQ-7 — nunca interpolar um termo de busca do
// usuário direto num `$regex` do Mongo sem escapar: caracteres especiais de regex (".", "*",
// "(", etc.) quebrariam a query de formas inesperadas, e em teoria abrem espaço pra um ataque de
// ReDoS com um termo malicioso.
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
