export interface AccountListFilters {
  from?: Date;
  to?: Date;
}

/**
 * Achado de performance da auditoria pré-produção (31/10/2026) — "listas de contas a pagar/
 * receber sem paginação nem filtro de período obrigatório": índice existe e a query é rápida,
 * mas devolvia a lista inteira — um restaurante com anos de contas recorrentes carregava tudo
 * de uma vez a cada abertura da tela Financeiro.
 *
 * Sem `from`/`to` explícito (nenhuma tela ainda manda — mudança 100% no servidor, sem exigir
 * nada novo do client): todo título `'aberto'` aparece, independente da idade (nunca esconde um
 * título ainda em aberto, por mais antigo que seja); histórico (`'pago'`/`'cancelado'`) só dos
 * últimos 12 meses — é esse histórico que cresce sem limite ano após ano, não os abertos (que
 * se resolvem e saem da lista naturalmente). Com `from`/`to` explícito, vira um filtro de
 * período comum (sem o `$or`), pronto pra uma tela futura oferecer escolher o período.
 */
export function buildAccountListQuery(restaurantId: string, filters?: AccountListFilters): Record<string, unknown> {
  if (filters?.from || filters?.to) {
    const dueDate: Record<string, Date> = {};
    if (filters.from) dueDate.$gte = filters.from;
    if (filters.to) dueDate.$lte = filters.to;
    return { restaurantId, dueDate };
  }
  const defaultFrom = new Date();
  defaultFrom.setMonth(defaultFrom.getMonth() - 12);
  return { restaurantId, $or: [{ status: 'aberto' }, { dueDate: { $gte: defaultFrom } }] };
}
