import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';
import { migrateOperatorRolesToDono } from './migrate-operator-roles-to-dono';

// specs/0021-papeis-operador REQ-7/AC-1/T014 — mock do Model (não integração real de Mongo):
// mesmo padrão de mockar dependências por interface já usado nos testes de controller
// (`Partial<IRepository>`), aqui aplicado à única chamada direta a um Model desta migração —
// nenhum outro arquivo de infra (`*.mongoose.repository.ts`) tem teste unitário próprio neste
// projeto (só os controllers, via repositório mockado); esta migração é a exceção porque ela
// mesma É a peça de infra a validar (REQ-7: idempotência e filtro corretos), sem controller por
// cima pra mockar em vez dela.
jest.mock('../models/restaurant-operator.mongoose.model', () => ({
  RestaurantOperatorModel: { updateMany: jest.fn() },
}));

describe('migrateOperatorRolesToDono (specs/0021-papeis-operador REQ-7)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('AC-1: atribui `dono` a todo operador pré-existente sem `role` no documento', async () => {
    (RestaurantOperatorModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 3 });

    await migrateOperatorRolesToDono();

    expect(RestaurantOperatorModel.updateMany).toHaveBeenCalledWith(
      { role: { $exists: false } },
      { $set: { role: 'dono' } },
    );
  });

  it('é idempotente: uma segunda chamada não encontra mais documentos sem `role` (não altera nada)', async () => {
    (RestaurantOperatorModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

    await expect(migrateOperatorRolesToDono()).resolves.toBeUndefined();
    expect(RestaurantOperatorModel.updateMany).toHaveBeenCalledTimes(1);
  });
});
