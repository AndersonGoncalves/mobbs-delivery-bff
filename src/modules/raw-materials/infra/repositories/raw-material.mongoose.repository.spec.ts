import { RawMaterialModel } from '../models/raw-material.mongoose.model';
import { RawMaterialMongooseRepository } from './raw-material.mongoose.repository';

// Achado real (pedido do usuário) — "Remover imagem" no formulário de matéria-prima não
// funcionava: `$set` com valor `undefined` é descartado pelo driver do Mongoose (o campo ficava
// do jeito que estava, nunca removido). `imageUrl` ausente no `update()` precisa de `$unset` de
// verdade, mesmo padrão já usado em `menu-category.mongoose.repository.ts`.
describe('RawMaterialMongooseRepository.update — remover imagem (achado real)', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockFindByIdAndUpdate() {
    const leanMock = jest.fn().mockResolvedValue({
      _id: 'rm-1', restaurantId: 'r-1', name: 'Queijo mussarela', priceDelta: 0, unit: 'kg', isActive: true, currentStock: 0,
    });
    const findByIdAndUpdateMock = jest.fn().mockReturnValue({ lean: leanMock });
    jest.spyOn(RawMaterialModel, 'findByIdAndUpdate').mockImplementation(findByIdAndUpdateMock as never);
    return findByIdAndUpdateMock;
  }

  it('com imageUrl informado, usa $set (nunca $unset)', async () => {
    const findByIdAndUpdateMock = mockFindByIdAndUpdate();
    const repository = new RawMaterialMongooseRepository();

    await repository.update('rm-1', 'Queijo mussarela', 0, 'kg', undefined, undefined, undefined, 'https://s3.example.com/queijo.jpg');

    const [, update] = findByIdAndUpdateMock.mock.calls[0];
    expect(update.$set.imageUrl).toBe('https://s3.example.com/queijo.jpg');
    expect(update.$unset).toBeUndefined();
  });

  it('sem imageUrl (removido pelo operador), usa $unset — não fica "do jeito que estava"', async () => {
    const findByIdAndUpdateMock = mockFindByIdAndUpdate();
    const repository = new RawMaterialMongooseRepository();

    await repository.update('rm-1', 'Queijo mussarela', 0, 'kg', undefined, undefined, undefined, undefined);

    const [, update] = findByIdAndUpdateMock.mock.calls[0];
    expect(update.$set.imageUrl).toBeUndefined();
    expect(update.$unset).toEqual({ imageUrl: '' });
  });
});
