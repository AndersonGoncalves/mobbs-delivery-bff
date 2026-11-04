import { HelpArticleMongooseRepository } from './help-article.mongoose.repository';
import { HelpArticleModel } from './help-article.mongoose.model';

jest.mock('./help-article.mongoose.model', () => ({
  HelpArticleModel: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), deleteOne: jest.fn() },
}));

const doc = {
  _id: 'a1', audience: 'retaguarda', moduleKey: 'restaurante', moduleLabel: 'Restaurante', moduleOrder: 1,
  itemLabel: 'Formas de Pagamento', itemOrder: 3, linkTo: '/settings/payment-methods', title: 'Formas de Pagamento',
  steps: [{ text: 'Abra Restaurante > Formas de Pagamento.', imageUrl: 'https://cdn.example.com/a.png' }],
  createdAt: new Date(), updatedAt: new Date(),
};

const repository = new HelpArticleMongooseRepository();

beforeEach(() => jest.resetAllMocks());

it('REQ-1/REQ-2: lista ordenado por moduleOrder/itemOrder (ordem de exibição do manual)', async () => {
  const lean = jest.fn().mockResolvedValue([doc]);
  const sort = jest.fn().mockReturnValue({ lean });
  jest.mocked(HelpArticleModel.find).mockReturnValue({ sort } as never);

  const result = await repository.list('retaguarda');

  expect(HelpArticleModel.find).toHaveBeenCalledWith({ audience: 'retaguarda' });
  expect(sort).toHaveBeenCalledWith({ moduleOrder: 1, itemOrder: 1 });
  expect(result).toEqual([{
    id: 'a1', audience: 'retaguarda', moduleKey: 'restaurante', moduleLabel: 'Restaurante', moduleOrder: 1,
    itemLabel: 'Formas de Pagamento', itemOrder: 3, linkTo: '/settings/payment-methods', title: 'Formas de Pagamento',
    steps: [{ text: 'Abra Restaurante > Formas de Pagamento.', imageUrl: 'https://cdn.example.com/a.png' }],
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  }]);
  expect(result[0]).not.toHaveProperty('_id');
});

it('passo sem imagem não vaza imageUrl vazio na entidade', async () => {
  const lean = jest.fn().mockResolvedValue([{ ...doc, steps: [{ text: 'Sem imagem.', imageUrl: '' }] }]);
  jest.mocked(HelpArticleModel.find).mockReturnValue({ sort: () => ({ lean }) } as never);

  const [result] = await repository.list('retaguarda');

  expect(result.steps).toEqual([{ text: 'Sem imagem.' }]);
});

it('cria e devolve a entidade sem metadados do Mongo', async () => {
  const input = {
    audience: 'retaguarda' as const, moduleKey: 'restaurante', moduleLabel: 'Restaurante', moduleOrder: 1,
    itemLabel: 'Formas de Pagamento', itemOrder: 3, linkTo: '/settings/payment-methods', title: 'Formas de Pagamento',
    steps: [{ text: 'Passo 1.' }],
  };
  jest.mocked(HelpArticleModel.create).mockResolvedValue({ toObject: () => doc } as never);

  const entity = await repository.create(input);

  expect(HelpArticleModel.create).toHaveBeenCalledWith(input);
  expect(entity.id).toBe('a1');
});

it('delete devolve false quando o artigo não existe', async () => {
  jest.mocked(HelpArticleModel.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);
  expect(await repository.delete('inexistente')).toBe(false);
});
