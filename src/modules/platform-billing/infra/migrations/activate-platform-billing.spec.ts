import { DEFAULT_BILLING_SETTINGS } from '../../../billing/domain/billing';
import { activatePlatformBilling } from './activate-platform-billing';

function setup(options: { activation?: { activatedMonth: string } | null; versions?: unknown[] } = {}) {
  const activationRepository = {
    get: jest.fn().mockResolvedValue(options.activation ?? null),
    createIfAbsent: jest.fn().mockImplementation(async (activatedMonth: string) => ({ activatedMonth })),
  };
  const settingsVersionRepository = {
    listAll: jest.fn().mockResolvedValue(options.versions ?? []),
    create: jest.fn().mockResolvedValue({ id: 'v1' }),
    currentAt: jest.fn(),
  };
  const billingSettingsRepository = { get: jest.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS), update: jest.fn() };
  return { activationRepository, settingsVersionRepository, billingSettingsRepository };
}

describe('activatePlatformBilling (REQ-34/AC-25)', () => {
  it('primeira execução: cria o piso de competência (mês corrente) e a versão 1 das configurações', async () => {
    const deps = setup();

    await activatePlatformBilling(deps);

    expect(deps.activationRepository.createIfAbsent).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
    expect(deps.settingsVersionRepository.create).toHaveBeenCalledWith(DEFAULT_BILLING_SETTINGS, expect.any(Date), 'system');
  });

  it('idempotente: deploy seguinte reutiliza o mês já ativado, nunca cria uma 2ª versão', async () => {
    const deps = setup({ activation: { activatedMonth: '2026-08' }, versions: [{ id: 'v1' }] });

    await activatePlatformBilling(deps);

    expect(deps.activationRepository.createIfAbsent).toHaveBeenCalledWith('2026-08');
    expect(deps.settingsVersionRepository.create).not.toHaveBeenCalled();
  });

  it('a versão 1 nasce com effectiveFrom no início do mês de ativação', async () => {
    const deps = setup({ activation: { activatedMonth: '2026-08' } });

    await activatePlatformBilling(deps);

    expect(deps.settingsVersionRepository.create).toHaveBeenCalledWith(DEFAULT_BILLING_SETTINGS, new Date('2026-08-01T03:00:00.000Z'), 'system');
  });
});
