import { escapeRegex } from '../../../shared/utils/escape-regex';

export interface AccountListFilters {
  from?: Date;
  to?: Date;
  /** Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
   * clientes e estoque": filtro por descrição, parcial e case-insensitive — sem ele, migrar a
   * tela pra paginação real no servidor quebraria a busca já existente (hoje feita no client
   * sobre a lista inteira, que deixa de existir). */
  search?: string;
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
  const query: Record<string, unknown> = { restaurantId };
  if (filters?.from || filters?.to) {
    const dueDate: Record<string, Date> = {};
    if (filters.from) dueDate.$gte = filters.from;
    if (filters.to) dueDate.$lte = filters.to;
    query.dueDate = dueDate;
  } else {
    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 12);
    query.$or = [{ status: 'aberto' }, { dueDate: { $gte: defaultFrom } }];
  }
  if (filters?.search) query.description = { $regex: escapeRegex(filters.search), $options: 'i' };
  return query;
}
