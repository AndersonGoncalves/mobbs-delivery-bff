import type { Request, Response, Server } from 'restify';

import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReferral } from '../domain/entities/referral.entity';
import { IReferralCodeRepository } from '../domain/repositories/referral-code.repository.interface';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';
import { CustomerReferralsController } from './customer-referrals.controller';
import { PlatformReferralsController } from './platform-referrals.controller';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), patch: register('PATCH') };
  return { application: application as unknown as Server, routes };
}

// Pula o `firebaseAuthMiddleware` (1º da chain); o middleware de admin, quando existe, roda como mock.
async function runChain(handlers: RouteHandler[], req: Partial<Request>, res: Partial<Response>): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req as Request, res as Response);
  }
}

function buildReferral(overrides: Partial<IReferral> = {}): IReferral {
  return {
    id: 'ref-1',
    referrerCustomerId: 'cu-1',
    referredRestaurantId: 'r-1',
    rewardCents: 10000,
    status: 'pendente',
    createdAt: new Date('2026-10-06T10:00:00Z'),
    ...overrides,
  };
}

describe('CustomerReferralsController (specs/0110 REQ-1/REQ-2)', () => {
  function setup(codeRepo: Partial<IReferralCodeRepository> = {}, referralRepo: Partial<IReferralRepository> = {}) {
    const referralCodeRepository = { findByCustomerId: jest.fn().mockResolvedValue(null), findCustomerIdByCode: jest.fn().mockResolvedValue(null), save: jest.fn(), ...codeRepo } as IReferralCodeRepository;
    const referralRepository = {
      getPendingBalanceCents: jest.fn().mockResolvedValue(0),
      findByReferrerCustomerId: jest.fn().mockResolvedValue([]),
      ...referralRepo,
    } as unknown as IReferralRepository;
    const restaurantRepository = { findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Pizzaria do João' }) } as unknown as IRestaurantRepository;
    const { application, routes } = buildFakeApplication();
    new CustomerReferralsController(referralCodeRepository, referralRepository, restaurantRepository).initializeRoutes(application);
    return { referralCodeRepository, referralRepository, routes };
  }

  it('REQ-1: na primeira abertura cria e salva um código de 6 caracteres e devolve o link', async () => {
    const { referralCodeRepository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /customers/me/referrals'], { user: { uid: 'cu-1' } } as Partial<Request>, { json } as unknown as Partial<Response>);

    const code = (referralCodeRepository.save as jest.Mock).mock.calls[0][1] as string;
    expect((referralCodeRepository.save as jest.Mock).mock.calls[0][0]).toBe('cu-1');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ referralCode: code, referralLink: `https://bsdelivery.com.br/?ref=${code}` }));
  });

  it('REQ-1: depois da primeira vez reutiliza o código já salvo, sem gerar outro', async () => {
    const { referralCodeRepository, routes } = setup({ findByCustomerId: jest.fn().mockResolvedValue('ABC123') });
    const json = jest.fn();

    await runChain(routes['GET /customers/me/referrals'], { user: { uid: 'cu-1' } } as Partial<Request>, { json } as unknown as Partial<Response>);

    expect(referralCodeRepository.save).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ referralCode: 'ABC123' }));
  });

  it('REQ-2: devolve saldo pendente e o histórico com o nome do restaurante indicado', async () => {
    const { routes } = setup(
      { findByCustomerId: jest.fn().mockResolvedValue('ABC123') },
      {
        getPendingBalanceCents: jest.fn().mockResolvedValue(20000),
        findByReferrerCustomerId: jest.fn().mockResolvedValue([buildReferral()]),
      },
    );
    const json = jest.fn();

    await runChain(routes['GET /customers/me/referrals'], { user: { uid: 'cu-1' } } as Partial<Request>, { json } as unknown as Partial<Response>);

    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        balanceCents: 20000,
        referrals: [expect.objectContaining({ referredRestaurantName: 'Pizzaria do João', status: 'pendente', rewardCents: 10000 })],
      }),
    );
  });
});

describe('PlatformReferralsController (specs/0110 REQ-7/REQ-8)', () => {
  function setup(referralRepo: Partial<IReferralRepository> = {}) {
    const referralRepository = {
      listAll: jest.fn().mockResolvedValue([buildReferral()]),
      findById: jest.fn().mockResolvedValue(buildReferral()),
      markPaid: jest.fn().mockResolvedValue(buildReferral({ status: 'pago', paidAt: new Date('2026-10-07T09:00:00Z') })),
      ...referralRepo,
    } as unknown as IReferralRepository;
    const customerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'cu-1', name: 'Anderson', email: 'a@exemplo.com', phone: '11999999999' }),
    } as unknown as ICustomerRepository;
    const restaurantRepository = { findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Pizzaria do João' }) } as unknown as IRestaurantRepository;
    const adminMiddleware = jest.fn();
    const { application, routes } = buildFakeApplication();
    new PlatformReferralsController(referralRepository, customerRepository, restaurantRepository, adminMiddleware).initializeRoutes(application);
    return { referralRepository, routes };
  }

  it('REQ-8: lista as indicações com o contato de quem indicou e filtra por status', async () => {
    const { referralRepository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /platform/referrals'], { query: { status: 'pendente' } } as unknown as Partial<Request>, { json } as unknown as Partial<Response>);

    expect(referralRepository.listAll).toHaveBeenCalledWith({ status: 'pendente' });
    expect(json).toHaveBeenCalledWith(
      200,
      [expect.objectContaining({ referrer: { id: 'cu-1', name: 'Anderson', email: 'a@exemplo.com', phone: '11999999999' }, referredRestaurant: { id: 'r-1', name: 'Pizzaria do João' } })],
    );
  });

  it('REQ-8: status fora de pendente/pago é ignorado e lista tudo', async () => {
    const { referralRepository, routes } = setup();

    await runChain(routes['GET /platform/referrals'], { query: { status: 'qualquer' } } as unknown as Partial<Request>, { json: jest.fn() } as unknown as Partial<Response>);

    expect(referralRepository.listAll).toHaveBeenCalledWith({ status: undefined });
  });

  it('REQ-7: marcar como paga devolve a indicação paga com a data do pagamento', async () => {
    const { referralRepository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['PATCH /platform/referrals/:id/paid'], { params: { id: 'ref-1' } } as unknown as Partial<Request>, { json } as unknown as Partial<Response>);

    expect(referralRepository.markPaid).toHaveBeenCalledWith('ref-1', expect.any(Date));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'pago', paidAt: new Date('2026-10-07T09:00:00Z') }));
  });

  it('REQ-7: indicação inexistente responde 404', async () => {
    const { routes } = setup({ findById: jest.fn().mockResolvedValue(null) });

    await expect(runChain(routes['PATCH /platform/referrals/:id/paid'], { params: { id: 'nope' } } as unknown as Partial<Request>, { json: jest.fn() } as unknown as Partial<Response>)).rejects.toThrow('Indicação não encontrada');
  });
});
