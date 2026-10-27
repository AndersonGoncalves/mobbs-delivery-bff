import { RestaurantModel } from '../models/restaurant.mongoose.model';
import { RestaurantMongooseRepository } from './restaurant.mongoose.repository';

const ACTIVE_FIELDS = {
  asaasAccountId: 'acc-antiga',
  asaasWalletId: 'wallet-antiga',
  asaasApiKey: 'key-antiga',
  asaasWebhookToken: 'token-antiga',
  asaasSubaccountData: { name: 'Prime Pizza', email: 'a@b.com', cpfCnpj: '123', birthDate: '1980-01-19', mobilePhone: '11999999999', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01000000' },
};

function baseDoc(overrides: Record<string, unknown> = {}) {
  return { _id: 'r-1', slug: 's', isActive: true, businessHours: [], ...overrides };
}

// Pedido explícito do usuário (follow-up) — `forgetAsaasSubaccount` deixou de descartar as
// credenciais de vez (ver comentário em `restaurant.entity.ts`, `IPreviousAsaasSubaccount`).
describe('RestaurantMongooseRepository — Asaas: arquivar e reconectar subconta (specs/0101)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('forgetAsaasSubaccount arquiva os campos ativos em previousAsaasSubaccounts e limpa os ativos', async () => {
    jest.spyOn(RestaurantModel, 'findById').mockReturnValue({ lean: () => Promise.resolve(baseDoc(ACTIVE_FIELDS)) } as never);
    const updateSpy = jest.spyOn(RestaurantModel, 'findByIdAndUpdate').mockReturnValue({
      lean: () => Promise.resolve(baseDoc({ onlinePaymentsEnabled: false, previousAsaasSubaccounts: [{ ...ACTIVE_FIELDS, subaccountData: ACTIVE_FIELDS.asaasSubaccountData, archivedAt: '2026-10-27T00:00:00.000Z' }] })),
    } as never);

    await new RestaurantMongooseRepository().forgetAsaasSubaccount('r-1');

    const [, update] = updateSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(update.$unset).toMatchObject({ asaasAccountId: 1, asaasWalletId: 1, asaasApiKey: 1, asaasWebhookToken: 1, asaasSubaccountData: 1 });
    expect(update.$push).toMatchObject({
      previousAsaasSubaccounts: expect.objectContaining({
        asaasAccountId: 'acc-antiga',
        asaasApiKey: 'key-antiga',
        subaccountData: ACTIVE_FIELDS.asaasSubaccountData,
        archivedAt: expect.any(String),
      }),
    });
  });

  it('forgetAsaasSubaccount sem subconta ativa só pausa, sem arquivar nada (nada pra arquivar)', async () => {
    jest.spyOn(RestaurantModel, 'findById').mockReturnValue({ lean: () => Promise.resolve(baseDoc()) } as never);
    const updateSpy = jest.spyOn(RestaurantModel, 'findByIdAndUpdate').mockReturnValue({ lean: () => Promise.resolve(baseDoc({ onlinePaymentsEnabled: false })) } as never);

    await new RestaurantMongooseRepository().forgetAsaasSubaccount('r-1');

    const [, update] = updateSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(update).toEqual({ $set: { onlinePaymentsEnabled: false } });
  });

  it('reconnectPreviousAsaasSubaccount restaura a entrada arquivada pro ativo e a remove do histórico', async () => {
    const archived = { ...ACTIVE_FIELDS, subaccountData: ACTIVE_FIELDS.asaasSubaccountData, archivedAt: '2026-10-27T00:00:00.000Z' };
    jest.spyOn(RestaurantModel, 'findOne').mockReturnValue({ lean: () => Promise.resolve(baseDoc({ previousAsaasSubaccounts: [archived] })) } as never);
    const updateSpy = jest.spyOn(RestaurantModel, 'findByIdAndUpdate').mockReturnValue({
      lean: () => Promise.resolve(baseDoc({ onlinePaymentsEnabled: true, ...ACTIVE_FIELDS, previousAsaasSubaccounts: [] })),
    } as never);

    await new RestaurantMongooseRepository().reconnectPreviousAsaasSubaccount('r-1', 'acc-antiga');

    const [, update] = updateSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(update.$set).toMatchObject({ onlinePaymentsEnabled: true, asaasAccountId: 'acc-antiga', asaasApiKey: 'key-antiga' });
    expect(update.$pull).toEqual({ previousAsaasSubaccounts: { asaasAccountId: 'acc-antiga' } });
  });

  it('reconnectPreviousAsaasSubaccount lança quando a entrada não existe no histórico', async () => {
    jest.spyOn(RestaurantModel, 'findOne').mockReturnValue({ lean: () => Promise.resolve(null) } as never);

    await expect(new RestaurantMongooseRepository().reconnectPreviousAsaasSubaccount('r-1', 'acc-inexistente')).rejects.toThrow(
      /não encontrada/,
    );
  });

  // Achado real — sobrescrever uma subconta ATIVA direto com `$set` perderia as credenciais dela
  // sem arquivar (diferente de `forgetAsaasSubaccount`, que sempre arquiva antes de limpar).
  it('reconnectPreviousAsaasSubaccount lança quando já existe uma subconta ativa (nunca sobrescreve sem arquivar)', async () => {
    const archived = { ...ACTIVE_FIELDS, asaasAccountId: 'acc-arquivada', subaccountData: ACTIVE_FIELDS.asaasSubaccountData, archivedAt: '2026-10-27T00:00:00.000Z' };
    jest.spyOn(RestaurantModel, 'findOne').mockReturnValue({
      lean: () => Promise.resolve(baseDoc({ asaasAccountId: 'acc-ativa-agora', previousAsaasSubaccounts: [archived] })),
    } as never);
    const updateSpy = jest.spyOn(RestaurantModel, 'findByIdAndUpdate');

    await expect(new RestaurantMongooseRepository().reconnectPreviousAsaasSubaccount('r-1', 'acc-arquivada')).rejects.toThrow(/já existe uma subconta/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
