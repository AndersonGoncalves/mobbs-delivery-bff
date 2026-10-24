import { SuggestionModel, SuggestionReadModel } from './suggestion.model';

it('AC-1: nova sugestão nasce Recebida, revisão zero e histórico vazio', async () => {
  const doc = new SuggestionModel({
    restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'autor@example.com',
    title: 'Novo recurso', description: 'Uma descrição detalhada.',
  });
  await expect(doc.validate()).resolves.toBeUndefined();
  expect(doc.status).toBe('received');
  expect(doc.revision).toBe(0);
  expect(doc.updates).toEqual([]);
  expect(doc._id).toMatch(/^[0-9a-f-]{36}$/);
});

it('AC-3: schema rejeita status fora do contrato', async () => {
  const doc = new SuggestionModel({
    restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'autor@example.com',
    title: 'Novo recurso', description: 'Uma descrição detalhada.', status: 'invalid',
  });
  await expect(doc.validate()).rejects.toThrow();
});

it('AC-4: leitura tem índice único por sugestão/operador e listagem tem índices de escopo/data', () => {
  expect(SuggestionReadModel.schema.indexes()).toContainEqual([
    { suggestionId: 1, operatorId: 1 }, expect.objectContaining({ unique: true }),
  ]);
  expect(SuggestionModel.schema.indexes()).toContainEqual([
    { restaurantId: 1, createdAt: -1, _id: -1 }, expect.anything(),
  ]);
});
