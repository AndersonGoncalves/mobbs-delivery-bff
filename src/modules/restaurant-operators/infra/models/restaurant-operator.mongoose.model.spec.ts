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

  it('schema tem campos opcionais de WhatsApp e foto', () => {
    expect(RestaurantOperatorModel.schema.path('whatsapp')?.instance).toBe('String');
    expect(RestaurantOperatorModel.schema.path('photoUrl')?.instance).toBe('String');
  });

  it('schema persiste "hasFullAccess" com valor padrão falso', () => {
    const operator = new RestaurantOperatorModel({
      restaurantId: 'r-1',
      email: 'manager@example.com',
      role: 'gerente',
    });

    expect(operator.hasFullAccess).toBe(false);
  });

  // Achado real (pedido explícito do usuário) — "um e-mail só pode estar ativo em UM restaurante
  // por vez" só era garantida no código (`POST /restaurants/me/operators`/`POST
  // /restaurants/signup`), nunca no banco: o índice único era só `(restaurantId, email)`, então
  // nada impedia duas ativações simultâneas por qualquer caminho fora desses dois endpoints.
  it('tem um índice único parcial em "email" só pra documentos ativos (permite histórico inativo)', () => {
    const emailActiveIndex = RestaurantOperatorModel.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).length === 1 && fields.email === 1);

    expect(emailActiveIndex).toBeDefined();
    const [, options] = emailActiveIndex!;
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({ isActive: true });
  });
});
