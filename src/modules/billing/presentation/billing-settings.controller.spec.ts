import { BillingSettingsController } from './billing-settings.controller';
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../domain/billing';

type Handler = (req: unknown, res: unknown) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes[`${method} ${path}`] = handlers;
  };
  const application = { get: register('GET'), put: register('PUT') };
  return { application: application as never, routes };
}

async function run(handlers: Handler[], req: unknown, res: unknown) {
  // Pula a checagem de Firebase (tem spec própria) e executa o middleware de admin + handler.
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function setup(initial: BillingSettings = DEFAULT_BILLING_SETTINGS) {
  let stored = initial;
  const billingSettingsRepository = {
    get: jest.fn().mockImplementation(async () => stored),
    update: jest.fn().mockImplementation(async (next: BillingSettings) => {
      stored = next;
      return stored;
    }),
  };
  const { application, routes } = buildFakeApplication();
  new BillingSettingsController(billingSettingsRepository as never, (async () => undefined) as never).initializeRoutes(application);
  return { billingSettingsRepository, routes };
}

describe('BillingSettingsController (specs/0113-parametrizacao-faixas-cobranca)', () => {
  it('AC-1: GET /billing-settings/public devolve os valores padrão sem nada configurado ainda', async () => {
    const { routes } = setup();
    const json = jest.fn();

    // Rota pública: todos os handlers rodam (sem middleware de admin pra pular).
    for (const handler of routes['GET /billing-settings/public']) {
      await handler({}, { json });
    }

    expect(json).toHaveBeenCalledWith(200, {
      freeLimitCents: 200_000,
      proLimitCents: 700_000,
      proMonthlyPriceCents: 7_990,
      premiumMonthlyPriceCents: 11_990,
    });
  });

  it('AC-2: GET /platform/billing-settings devolve os 5 campos, incluindo o multiplicador anual', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await run(routes['GET /platform/billing-settings'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, DEFAULT_BILLING_SETTINGS);
  });

  it('AC-3: PUT /platform/billing-settings grava os valores novos e passam a valer na leitura seguinte', async () => {
    const { routes, billingSettingsRepository } = setup();
    const next = { freeLimitCents: 100_000, proLimitCents: 400_000, proMonthlyPriceCents: 5_000, premiumMonthlyPriceCents: 9_000, annualMultiplier: 12 };
    const json = jest.fn();

    await run(routes['PUT /platform/billing-settings'], { body: next }, { json });

    expect(billingSettingsRepository.update).toHaveBeenCalledWith(next);
    expect(json).toHaveBeenCalledWith(200, next);

    const readJson = jest.fn();
    await run(routes['GET /platform/billing-settings'], {}, { json: readJson });
    expect(readJson).toHaveBeenCalledWith(200, next);
  });

  it('AC-5: limite da faixa Pro menor ou igual ao da Gratuita é recusado com 400, sem gravar', async () => {
    const { routes, billingSettingsRepository } = setup();
    const invalid = { freeLimitCents: 300_000, proLimitCents: 300_000, proMonthlyPriceCents: 5_000, premiumMonthlyPriceCents: 9_000, annualMultiplier: 10 };

    await expect(run(routes['PUT /platform/billing-settings'], { body: invalid }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    expect(billingSettingsRepository.update).not.toHaveBeenCalled();
  });

  it('AC-5: mensalidade Premium menor ou igual à Pro é recusada com 400, sem gravar', async () => {
    const { routes, billingSettingsRepository } = setup();
    const invalid = { freeLimitCents: 200_000, proLimitCents: 700_000, proMonthlyPriceCents: 9_000, premiumMonthlyPriceCents: 9_000, annualMultiplier: 10 };

    await expect(run(routes['PUT /platform/billing-settings'], { body: invalid }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    expect(billingSettingsRepository.update).not.toHaveBeenCalled();
  });

  it('AC-5: valor negativo é recusado com 400, sem gravar', async () => {
    const { routes, billingSettingsRepository } = setup();
    const invalid = { freeLimitCents: -1, proLimitCents: 700_000, proMonthlyPriceCents: 7_990, premiumMonthlyPriceCents: 11_990, annualMultiplier: 10 };

    await expect(run(routes['PUT /platform/billing-settings'], { body: invalid }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    expect(billingSettingsRepository.update).not.toHaveBeenCalled();
  });
});
