import { RestaurantModel } from '../models/restaurant.mongoose.model';
import { RestaurantMongooseRepository } from './restaurant.mongoose.repository';

describe('RestaurantMongooseRepository — shareMessage padrão (specs/0072)', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockFindById(doc: Record<string, unknown>) {
    jest.spyOn(RestaurantModel, 'findById').mockReturnValue({ lean: () => Promise.resolve({ _id: 'r-1', slug: 's', isActive: true, businessHours: [], ...doc }) } as never);
  }

  it('restaurante sem shareMessage recebe o texto padrão com o nome dele', async () => {
    mockFindById({ name: 'Prime Pizza' });

    const restaurant = await new RestaurantMongooseRepository().findById('r-1');

    expect(restaurant?.shareMessage).toContain('o cardápio do Prime Pizza!');
  });

  it('shareMessage configurado é preservado, inclusive string vazia (só o link)', async () => {
    mockFindById({ name: 'Prime Pizza', shareMessage: 'Meu texto' });
    expect((await new RestaurantMongooseRepository().findById('r-1'))?.shareMessage).toBe('Meu texto');

    mockFindById({ name: 'Prime Pizza', shareMessage: '' });
    expect((await new RestaurantMongooseRepository().findById('r-1'))?.shareMessage).toBe('');
  });
});
