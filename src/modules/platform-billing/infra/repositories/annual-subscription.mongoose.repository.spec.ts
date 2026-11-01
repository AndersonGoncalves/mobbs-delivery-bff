import { AnnualSubscriptionModel } from '../models/annual-subscription.mongoose.model';
import { AnnualSubscriptionMongooseRepository } from './annual-subscription.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da plataforma (1
// query por restaurante cadastrado)".
describe('AnnualSubscriptionMongooseRepository.getActiveRestaurantIds (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devolve o conjunto de restaurantes com assinatura anual ATIVA, num só round-trip', async () => {
    const leanMock = jest.fn().mockResolvedValue([{ restaurantId: 'r-1' }, { restaurantId: 'r-3' }]);
    const findSpy = jest.spyOn(AnnualSubscriptionModel, 'find').mockReturnValue({ lean: leanMock } as never);
    const repository = new AnnualSubscriptionMongooseRepository();

    const result = await repository.getActiveRestaurantIds();

    expect(findSpy).toHaveBeenCalledWith({ renewalActive: true }, { restaurantId: 1 });
    expect(result).toEqual(new Set(['r-1', 'r-3']));
    expect(result.has('r-2')).toBe(false);
  });
});
