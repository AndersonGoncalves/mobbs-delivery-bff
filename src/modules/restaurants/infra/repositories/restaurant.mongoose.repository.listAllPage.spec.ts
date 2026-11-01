import { RestaurantModel } from '../models/restaurant.mongoose.model';
import { RestaurantMongooseRepository } from './restaurant.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "'Restaurantes da plataforma' não pagina nem
// filtra".
describe('RestaurantMongooseRepository.listAllPage (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockFindChain(docs: unknown[]) {
    const leanMock = jest.fn().mockResolvedValue(docs);
    const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    const findSpy = jest.spyOn(RestaurantModel, 'find').mockReturnValue({ sort: sortMock } as never);
    return { findSpy, sortMock, skipMock, limitMock };
  }

  it('pagina no servidor (sort/skip/limit) e devolve o total real, não o total da página', async () => {
    const { findSpy, sortMock, skipMock, limitMock } = mockFindChain([{ _id: 'r-2', name: 'Burger', slug: 'burger', isActive: true, businessHours: [] }]);
    jest.spyOn(RestaurantModel, 'countDocuments').mockResolvedValue(523 as never);
    const repository = new RestaurantMongooseRepository();

    const result = await repository.listAllPage({ skip: 25, limit: 25 });

    expect(findSpy).toHaveBeenCalledWith({});
    expect(sortMock).toHaveBeenCalledWith({ name: 1 });
    expect(skipMock).toHaveBeenCalledWith(25);
    expect(limitMock).toHaveBeenCalledWith(25);
    expect(result.total).toBe(523);
    expect(result.items.map((r) => r.id)).toEqual(['r-2']);
  });

  it('search filtra por nome OU slug, parcial e case-insensitive, com o termo escapado', async () => {
    const { findSpy } = mockFindChain([]);
    jest.spyOn(RestaurantModel, 'countDocuments').mockResolvedValue(0 as never);
    const repository = new RestaurantMongooseRepository();

    await repository.listAllPage({ skip: 0, limit: 25 }, 'bur.ger');

    expect(findSpy).toHaveBeenCalledWith({
      $or: [
        { name: { $regex: 'bur\\.ger', $options: 'i' } },
        { slug: { $regex: 'bur\\.ger', $options: 'i' } },
      ],
    });
  });
});
