import { escapeRegex } from '../../../shared/utils/escape-regex';

export interface AccountListFilters {
  from?: Date;
  to?: Date;
  /** Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
   * clientes e estoque": filtro por descrição, parcial e case-insensitive — sem ele, migrar a
   * tela pra paginação real no servidor quebraria a busca já existente (hoje feita no client
   * sobre a lista inteira, que deixa de existir). */
  search?: string;
  /** specs/0231-filtro-datas-contas-pedidos-compra REQ-1 — situação do título. */
  status?: 'aberto' | 'pago' | 'cancelado';
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
 *
 * specs/0231-filtro-datas-contas-pedidos-compra — `status` opcional, combinável com ou sem
 * período. Com período: filtro simples de `status` junto do `dueDate`. Sem período: `'aberto'`
 * traz TODOS os abertos, de qualquer idade (mesma regra do default, que nunca esconde um título
 * aberto); `'pago'`/`'cancelado'` mantêm a janela de 12 meses do default (é o histórico que
 * cresce sem limite — pra ver mais antigo, o operador informa o período). Sem período e sem
 * `status`, o default acima continua exatamente igual.
 */
export function buildAccountListQuery(restaurantId: string, filters?: AccountListFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { restaurantId };
  if (filters?.from || filters?.to) {
    const dueDate: Record<string, Date> = {};
    if (filters.from) dueDate.$gte = filters.from;
    if (filters.to) dueDate.$lte = filters.to;
    query.dueDate = dueDate;
    if (filters.status) query.status = filters.status;
  } else {
    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 12);
    if (!filters?.status) {
      query.$or = [{ status: 'aberto' }, { dueDate: { $gte: defaultFrom } }];
    } else {
      query.status = filters.status;
      if (filters.status !== 'aberto') query.dueDate = { $gte: defaultFrom };
    }
  }
  if (filters?.search) query.description = { $regex: escapeRegex(filters.search), $options: 'i' };
  return query;
}
