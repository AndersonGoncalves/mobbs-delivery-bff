import { z } from 'zod';

/**
 * Achado da auditoria pré-produção (31/10/2026) — "listas (produtos, clientes, financeiro)
 * carregam tudo de uma vez; paginação só no front": `page`/`pageSize` OPCIONAIS, mesclados ao
 * schema de query já existente de cada endpoint (`z.object({...}).merge(paginationQuerySchema)`)
 * — omitidos, o endpoint continua devolvendo a lista inteira exatamente como antes (nenhum dos
 * consumidores internos do BFF, nem das outras telas do próprio app cliente, que esperam a
 * lista inteira, quebra); só quando informados o endpoint pagina de verdade no servidor.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface SkipLimit {
  skip: number;
  limit: number;
}

/** `null` quando nenhum dos dois foi informado — chamador decide usar a busca não paginada de
 * sempre; informar só um dos dois já liga a paginação (`page` default 1, `pageSize` default 25). */
export function resolvePagination(params: PaginationParams): SkipLimit | null {
  if (params.page === undefined && params.pageSize === undefined) return null;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, limit: pageSize };
}
