import type { Request } from 'restify';

import { requireOperatorRole } from './require-operator-role.middleware';

function buildRequest(operatorRole?: 'dono' | 'gerente' | 'financeiro'): Request {
  return { operatorRole } as unknown as Request;
}

/**
 * specs/0021-papeis-operador — testa a única peça real de enforcement (REQ-5: o BFF nunca confia
 * só na UI escondendo botão). Cada controller de módulo (`catalog`, `raw-materials`,
 * `purchase-orders`, `suppliers`, `customers-admin`, `financeiro/*`, `orders`) aplica esta mesma
 * factory com um conjunto fixo de papéis por rota (conferido lendo cada `initializeRoutes` —
 * `requireOperatorRole('dono','gerente')` em cardápio/estoque/clientes/pedidos gerais,
 * `requireOperatorRole('dono','financeiro')` no financeiro, `requireOperatorRole('dono')` na
 * gestão de operadores, `requireOperatorRole('dono','gerente','financeiro')` só em
 * `PATCH .../orders/:id/payment/confirm`) — como o middleware é sempre o mesmo import, exercitar
 * aqui os 4 conjuntos de papéis realmente usados no código cobre a semântica de AC-2/AC-3/AC-4/
 * AC-7 sem duplicar a mesma asserção em cada um dos ~10 arquivos de controller.
 */
describe('requireOperatorRole (specs/0021-papeis-operador REQ-2..REQ-6)', () => {
  it('REQ-2: `dono` nunca é bloqueado, em qualquer conjunto de papéis exigido', async () => {
    const req = buildRequest('dono');

    await expect(requireOperatorRole('dono', 'gerente')(req)).resolves.toBeUndefined();
    await expect(requireOperatorRole('dono', 'financeiro')(req)).resolves.toBeUndefined();
    await expect(requireOperatorRole('dono')(req)).resolves.toBeUndefined();
  });

  // AC-2/T015 — cardápio (0007), estoque/compras (0015), clientes (0016), pedidos gerais (0008):
  // `requireOperatorRole('dono', 'gerente')`.
  it('AC-2: `gerente` acessa rotas de cardápio/estoque/clientes/pedidos (`dono`,`gerente`)', async () => {
    await expect(requireOperatorRole('dono', 'gerente')(buildRequest('gerente'))).resolves.toBeUndefined();
  });

  it('AC-2/AC-4/T015/T017: `gerente` é bloqueado (403) numa rota de financeiro, mesmo via chamada direta de API', async () => {
    await expect(requireOperatorRole('dono', 'financeiro')(buildRequest('gerente'))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  // AC-3/T016 — financeiro (0014): `requireOperatorRole('dono', 'financeiro')`.
  it('AC-3: `financeiro` acessa rotas do módulo financeiro (`dono`,`financeiro`)', async () => {
    await expect(requireOperatorRole('dono', 'financeiro')(buildRequest('financeiro'))).resolves.toBeUndefined();
  });

  it('AC-3/T016: `financeiro` é bloqueado (403) numa rota de cardápio/estoque/clientes', async () => {
    await expect(requireOperatorRole('dono', 'gerente')(buildRequest('financeiro'))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  // AC-5/T008 — gestão de operadores (0010): só `dono`.
  it('AC-5: `gerente` e `financeiro` são bloqueados (403) na gestão de operadores (`dono` só)', async () => {
    await expect(requireOperatorRole('dono')(buildRequest('gerente'))).rejects.toMatchObject({ statusCode: 403 });
    await expect(requireOperatorRole('dono')(buildRequest('financeiro'))).rejects.toMatchObject({ statusCode: 403 });
  });

  // AC-7/T020 — `PATCH .../orders/:id/payment/confirm` (0020): `requireOperatorRole('dono',
  // 'gerente', 'financeiro')`, os dois papéis operacionais confirmam Pix.
  it('AC-7: `financeiro` confirma Pix recebido (`dono`,`gerente`,`financeiro`), mesmo sem acesso a pedidos em geral', async () => {
    await expect(
      requireOperatorRole('dono', 'gerente', 'financeiro')(buildRequest('financeiro')),
    ).resolves.toBeUndefined();
  });

  it('`gerente` também confirma Pix recebido (papel operacional, REQ-3)', async () => {
    await expect(
      requireOperatorRole('dono', 'gerente', 'financeiro')(buildRequest('gerente')),
    ).resolves.toBeUndefined();
  });

  it('rejeita (403) quando `req.operatorRole` nunca foi populado (bug de composição de rota, não confia em undefined)', async () => {
    await expect(requireOperatorRole('dono')(buildRequest(undefined))).rejects.toMatchObject({ statusCode: 403 });
  });
});
