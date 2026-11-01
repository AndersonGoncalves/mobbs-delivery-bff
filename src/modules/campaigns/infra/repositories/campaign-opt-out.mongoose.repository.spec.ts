import { CampaignOptOutModel } from '../models/campaign-opt-out.mongoose.model';
import { CampaignOptOutMongooseRepository } from './campaign-opt-out.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "disparo de campanha WhatsApp: opt-out
// checado 1 cliente por vez".
describe('CampaignOptOutMongooseRepository.listOptedOutCustomerIds (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devolve o conjunto de clientes descadastrados DESTE restaurante, num só round-trip', async () => {
    const leanMock = jest.fn().mockResolvedValue([{ customerId: 'c-2' }, { customerId: 'c-5' }]);
    const findSpy = jest.spyOn(CampaignOptOutModel, 'find').mockReturnValue({ lean: leanMock } as never);
    const repository = new CampaignOptOutMongooseRepository();

    const result = await repository.listOptedOutCustomerIds('r-1');

    expect(findSpy).toHaveBeenCalledWith({ restaurantId: 'r-1', optedOutAt: { $exists: true } }, { customerId: 1 });
    expect(result).toEqual(new Set(['c-2', 'c-5']));
    expect(result.has('c-1')).toBe(false);
  });
});
