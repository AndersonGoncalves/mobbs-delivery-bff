import { SubscriptionObligationModel } from '../models/subscription-obligation.mongoose.model';
import { SubscriptionObligationMongooseRepository } from './subscription-obligation.mongoose.repository';

describe('SubscriptionObligationMongooseRepository.upsertAnnual (specs/0175 — bug de produção 2026-10-29)', () => {
  afterEach(() => jest.restoreAllMocks());

  const input = {
    restaurantId: 'r-1',
    kind: 'annual-initial' as const,
    coveragePeriod: { start: new Date('2026-10-29T00:00:00Z'), end: new Date('2027-10-29T00:00:00Z') },
    tier: 'pro' as const,
    settingsVersionId: 'v1',
    amountCents: 79900,
    dueDate: new Date('2026-11-08T00:00:00Z'),
  };

  it('sem documento existente: insere um novo com status awaiting_issue', async () => {
    const findQuery = SubscriptionObligationModel.findOne({});
    jest.spyOn(findQuery, 'lean').mockResolvedValue(null);
    jest.spyOn(SubscriptionObligationModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = SubscriptionObligationModel.findOneAndUpdate({}, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({ ...input, _id: 'o-1', status: 'awaiting_issue' });
    const findOneAndUpdate = jest.spyOn(SubscriptionObligationModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new SubscriptionObligationMongooseRepository().upsertAnnual(input);

    expect(result.status).toBe('awaiting_issue');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', kind: 'annual-initial' }),
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ status: 'awaiting_issue' }) }),
      { upsert: true, new: true },
    );
  });

  it('com documento existente NÃO cancelado (mesma chave): devolve o existente intocado (idempotência normal)', async () => {
    const findQuery = SubscriptionObligationModel.findOne({});
    jest.spyOn(findQuery, 'lean').mockResolvedValue({ ...input, _id: 'o-1', status: 'pending', asaasChargeId: 'asaas-1' });
    jest.spyOn(SubscriptionObligationModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = SubscriptionObligationModel.findOneAndUpdate({}, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({ ...input, _id: 'o-1', status: 'pending', asaasChargeId: 'asaas-1' });
    jest.spyOn(SubscriptionObligationModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new SubscriptionObligationMongooseRepository().upsertAnnual(input);

    expect(result.status).toBe('pending');
    expect(result.asaasChargeId).toBe('asaas-1');
  });

  it('com documento CANCELADO na mesma chave (desistência + nova adesão no mesmo dia): revive em vez de devolver a sobra cancelada', async () => {
    const findQuery = SubscriptionObligationModel.findOne({});
    jest.spyOn(findQuery, 'lean').mockResolvedValue({
      ...input,
      _id: 'o-old',
      status: 'cancelled',
      asaasChargeId: 'asaas-old',
      pixPayload: 'pix-old',
      issuedAt: new Date('2026-10-20'),
    });
    jest.spyOn(SubscriptionObligationModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = SubscriptionObligationModel.findOneAndUpdate({}, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({ ...input, _id: 'o-old', status: 'awaiting_issue' });
    const findOneAndUpdate = jest.spyOn(SubscriptionObligationModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new SubscriptionObligationMongooseRepository().upsertAnnual(input);

    expect(result.id).toBe('o-old');
    expect(result.status).toBe('awaiting_issue');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', kind: 'annual-initial' }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'awaiting_issue', amountCents: 79900 }),
        $unset: expect.objectContaining({ asaasChargeId: 1, pixPayload: 1, issuedAt: 1 }),
      }),
      { new: true },
    );
  });
});
