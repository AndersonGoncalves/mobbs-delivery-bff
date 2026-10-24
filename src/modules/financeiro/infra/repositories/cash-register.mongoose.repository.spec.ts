import { CashRegisterMongooseRepository } from './cash-register.mongoose.repository';
import { CashRegisterSessionModel } from '../models/cash-register-session.mongoose.model';
import { CashMovementEntryModel } from '../models/cash-movement-entry.mongoose.model';

const lean = (value: unknown) => ({ lean: jest.fn().mockImplementation(async () => typeof value === 'function' ? value() : value) });
const session = () => ({
  _id: 's', restaurantId: 'r', businessDate: '2026-10-24', openedAt: new Date('2026-10-24T11:00:00Z'),
  status: 'aberto', openingBalance: 0, movementVersion: 0, movementWrites: 0,
});

describe('persistência concorrente do caixa (sem banco real)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('duas aberturas simultâneas da mesma data têm somente um vencedor, mesmo sem índice novo instalado', async () => {
    const repository = new CashRegisterMongooseRepository();
    jest.spyOn(repository, 'findSessionByDate').mockResolvedValue(null);
    const ids = new Set<string>();
    jest.spyOn(CashRegisterSessionModel, 'create').mockImplementation((async (input: { _id: string }) => {
      if (ids.has(input._id)) throw { code: 11000 };
      ids.add(input._id);
      return { toObject: () => input };
    }) as never);
    const results = await Promise.allSettled([
      repository.open('r', 0, 'one', false, new Date('2026-10-24T11:00:00Z')),
      repository.open('r', 100, 'two', false, new Date('2026-10-24T12:00:00Z')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(ids.size).toBe(1);
  });

  it('permite datas diferentes e nunca reabre a data já fechada', async () => {
    const repository = new CashRegisterMongooseRepository();
    jest.spyOn(repository, 'findSessionByDate').mockResolvedValue({
      id: 'old', restaurantId: 'r', openedAt: '2026-10-24T11:00:00Z', openingBalance: 0, status: 'fechado',
    });
    await expect(repository.open('r', 0, 'one', false, new Date('2026-10-24T12:00:00Z')))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('duas notificações concorrentes do mesmo pagamento persistem somente uma entrada', async () => {
    const repository = new CashRegisterMongooseRepository();
    const stored = new Map<string, unknown>();
    jest.spyOn(CashRegisterSessionModel, 'findOneAndUpdate').mockReturnValue(lean(session()) as never);
    jest.spyOn(CashRegisterSessionModel, 'updateOne').mockResolvedValue({} as never);
    jest.spyOn(CashMovementEntryModel, 'create').mockImplementation((async (input: { _id: string }) => {
      if (stored.has(input._id)) throw { code: 11000 };
      const doc = { ...input, createdAt: new Date() };
      stored.set(input._id, doc);
      return { toObject: () => doc };
    }) as never);
    jest.spyOn(CashMovementEntryModel, 'findById').mockImplementation(((id: string) => lean(stored.get(id))) as never);
    const input = { type: 'entrada' as const, amount: 10, description: 'Pix', orderId: 'o', paymentId: 'p' };
    const results = await Promise.all([repository.addMovement('s', input), repository.addMovement('s', input)]);
    expect(results[0].id).toBe(results[1].id);
    expect(stored.size).toBe(1);
  });

  it('duas conferências simultâneas não sobrescrevem o primeiro fechamento', async () => {
    const repository = new CashRegisterMongooseRepository();
    const state = session();
    jest.spyOn(CashRegisterSessionModel, 'findById').mockImplementation(() => lean({ ...state }) as never);
    jest.spyOn(repository, 'getCalculatedBalance').mockResolvedValue(10);
    jest.spyOn(CashRegisterSessionModel, 'findOneAndUpdate').mockImplementation(((_filter: unknown, update: { $set: object }) => lean(() => {
      if (state.status !== 'aberto') return null;
      Object.assign(state, update.$set);
      return { ...state };
    })) as never);
    const results = await Promise.allSettled([repository.close('s', 10, 'one'), repository.close('s', 20, 'two')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(state).toMatchObject({ closingBalance: 10, closedBy: 'one', closedAutomatically: false });
  });

  it('recusa fechamento enquanto uma gravação de movimento está em andamento', async () => {
    const repository = new CashRegisterMongooseRepository();
    jest.spyOn(CashRegisterSessionModel, 'findById').mockReturnValue(lean({ ...session(), movementWrites: 1 }) as never);
    const close = jest.spyOn(CashRegisterSessionModel, 'findOneAndUpdate');
    await expect(repository.close('s', 10)).rejects.toMatchObject({ statusCode: 409 });
    expect(close).not.toHaveBeenCalled();
  });

  it('recusa um saldo conferido que mudou durante o fechamento', async () => {
    const repository = new CashRegisterMongooseRepository();
    jest.spyOn(CashRegisterSessionModel, 'findById').mockReturnValue(lean(session()) as never);
    jest.spyOn(repository, 'getCalculatedBalance').mockResolvedValue(10);
    const update = jest.spyOn(CashRegisterSessionModel, 'findOneAndUpdate').mockReturnValue(lean(null) as never);
    await expect(repository.close('s', 10)).rejects.toMatchObject({ statusCode: 409 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ movementVersion: 0, movementWrites: 0, status: 'aberto' }), expect.anything(), { new: true });
  });
});
