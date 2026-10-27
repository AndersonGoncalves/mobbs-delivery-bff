import { IRestaurant } from '../domain/entities/restaurant.entity';
import { toOperatorRestaurant } from './restaurant-serializers';

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'prime-pizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    ...overrides,
  } as IRestaurant;
}

describe('toOperatorRestaurant', () => {
  it('remove asaasApiKey/asaasWebhookToken do campo ativo', () => {
    const safe = toOperatorRestaurant(buildRestaurant({ asaasApiKey: 'segredo', asaasWebhookToken: 'segredo-2', asaasAccountId: 'acc-1' }));

    expect(safe).not.toHaveProperty('asaasApiKey');
    expect(safe).not.toHaveProperty('asaasWebhookToken');
    expect(safe.asaasAccountId).toBe('acc-1');
  });

  // Pedido explícito do usuário (follow-up) — `previousAsaasSubaccounts` arquiva a chave de API
  // de cada subconta esquecida; a retaguarda só lista pra oferecer "Reconectar", nunca vê a chave.
  it('remove asaasApiKey/asaasWebhookToken de cada entrada de previousAsaasSubaccounts', () => {
    const safe = toOperatorRestaurant(
      buildRestaurant({
        previousAsaasSubaccounts: [
          {
            asaasAccountId: 'acc-antiga',
            asaasWalletId: 'wallet-antiga',
            asaasApiKey: 'segredo-subconta',
            asaasWebhookToken: 'segredo-webhook',
            subaccountData: { name: 'Teste', email: 'a@b.com', cpfCnpj: '123', birthDate: '1980-01-19', mobilePhone: '11999999999', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01000000' },
            archivedAt: '2026-10-27T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(safe.previousAsaasSubaccounts).toHaveLength(1);
    const [entry] = safe.previousAsaasSubaccounts!;
    expect(entry).not.toHaveProperty('asaasApiKey');
    expect(entry).not.toHaveProperty('asaasWebhookToken');
    expect(entry.asaasAccountId).toBe('acc-antiga');
    expect(entry.subaccountData.email).toBe('a@b.com');
  });
});
