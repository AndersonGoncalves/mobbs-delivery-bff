import { resolvePagination } from './pagination';

// Achado da auditoria pré-produção (31/10/2026) — "listas carregam tudo de uma vez; paginação
// só no front".
describe('resolvePagination', () => {
  it('sem page nem pageSize, devolve null — chamador usa a busca não paginada de sempre', () => {
    expect(resolvePagination({})).toBeNull();
  });

  it('page e pageSize informados, calcula skip/limit', () => {
    expect(resolvePagination({ page: 3, pageSize: 20 })).toEqual({ skip: 40, limit: 20 });
  });

  it('só page informado, usa pageSize default (25)', () => {
    expect(resolvePagination({ page: 2 })).toEqual({ skip: 25, limit: 25 });
  });

  it('só pageSize informado, usa page default (1)', () => {
    expect(resolvePagination({ pageSize: 10 })).toEqual({ skip: 0, limit: 10 });
  });

  it('page 1 nunca pula nenhum documento', () => {
    expect(resolvePagination({ page: 1, pageSize: 50 })).toEqual({ skip: 0, limit: 50 });
  });
});
