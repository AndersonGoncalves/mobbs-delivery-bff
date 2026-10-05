import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';
import { ReferralsController } from './referrals.controller';

type FakeRequest = { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest & Partial<Request>, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware e o middleware de operador (cada um tem spec própria) e injeta
// `restaurantId` como o middleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

describe('ReferralsController (specs/0043-programa-indicacao AC-4)', () => {
  function setup() {
    const referralRepository: Partial<IReferralRepository> = {
      findByReferrerRestaurantId: jest.fn().mockResolvedValue([
        { id: 'ref-1', referrerRestaurantId: 'r-1', referredRestaurantId: 'r-2', rewardCents: 10000, createdAt: new Date('2026-09-01') },
        { id: 'ref-2', referrerRestaurantId: 'r-1', referredRestaurantId: 'r-3', rewardCents: 10000, createdAt: new Date('2026-09-02') },
        { id: 'ref-3', referrerRestaurantId: 'r-1', referredRestaurantId: 'r-4', rewardCents: 10000, createdAt: new Date('2026-09-03') },
      ]),
      getBalanceCents: jest.fn().mockResolvedValue(30000),
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'r-1') return { id: 'r-1', name: 'Prime Pizza', referralCode: 'ABC123' };
        return { id, name: `Restaurante ${id}` };
      }),
    };
    const middleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new ReferralsController(referralRepository as IReferralRepository, restaurantRepository as IRestaurantRepository, middleware).initializeRoutes(application);
    return { referralRepository, routes };
  }

  it('devolve código, link, histórico e saldo com múltiplas indicações', async () => {
    const { referralRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/referrals'], { restaurantId: 'r-1' }, { json });

    expect(referralRepository.getBalanceCents).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        referralCode: 'ABC123',
        referralLink: 'https://bsdelivery.com.br/?ref=ABC123',
        balanceCents: 30000,
        referrals: [
          expect.objectContaining({ referredRestaurantName: 'Restaurante r-2', rewardCents: 10000 }),
          expect.objectContaining({ referredRestaurantName: 'Restaurante r-3' }),
          expect.objectContaining({ referredRestaurantName: 'Restaurante r-4' }),
        ],
      }),
    );
  });
});
