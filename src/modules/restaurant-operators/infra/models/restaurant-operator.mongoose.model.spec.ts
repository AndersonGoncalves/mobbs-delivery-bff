import { RestaurantOperatorModel } from './restaurant-operator.mongoose.model';

/**
 * (ajuste, pedido explícito do usuário) — achado real: o enum do campo `role` nunca foi
 * atualizado quando specs/0137-papeis-garcom-motoboy acrescentou os papéis `garcom`/`motoboy` —
 * a validação Zod da rota já aceitava os dois, mas o Mongoose rejeitava o `.create()` na hora de
 * salvar (erro não tratado). Checagem de schema pura (sem precisar de Mongo de verdade — este
 * projeto não tem infra de integração com banco em memória, só specs de controller com
 * repositório mockado) pra nunca mais dessincronizar os dois.
 */
describe('RestaurantOperatorModel', () => {
  it('schema do campo "role" aceita todos os OPERATOR_ROLES, não só dono/gerente/financeiro', () => {
    const enumValues = (RestaurantOperatorModel.schema.path('role') as unknown as { enumValues: string[] }).enumValues;

    expect(enumValues).toEqual(expect.arrayContaining(['dono', 'gerente', 'financeiro', 'garcom', 'motoboy']));
  });

  it('schema tem um campo "name" opcional, texto livre', () => {
    const namePath = RestaurantOperatorModel.schema.path('name');

    expect(namePath).toBeDefined();
    expect(namePath.instance).toBe('String');
  });
});
