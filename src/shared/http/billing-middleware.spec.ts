import { buildRestaurantOperatorMiddleware } from './restaurant-operator.middleware';
import { BillingBlockedError } from './billing-blocked.error';
import type { IRestaurant } from '../../modules/restaurants/domain/entities/restaurant.entity';

function buildRestaurant(billing: IRestaurant['billing']): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', billing } as IRestaurant;
}

function buildRequest() {
  return { user: { email: 'dono@exemplo.com' } } as unknown as Parameters<ReturnType<typeof buildRestaurantOperatorMiddleware>>[0];
}

const operatorRepository = {
  findActiveOperatorByEmail: jest.fn().mockResolvedValue({ id: 'op-1', restaurantId: 'r-1', role: 'dono' }),
};

describe('retaguarda bloqueada por inadimplência (specs/0042 REQ-7/REQ-8)', () => {
  it('AC-7: operador de restaurante bloqueado em faixa paga é recusado com billing_blocked', async () => {
    const restaurantRepository = {
      findById: jest.fn().mockResolvedValue(
        buildRestaurant({ referenceMonth: '2026-10', currentTier: 'pro', notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked', cycle: 'monthly' }),
      ),
    };
    const middleware = buildRestaurantOperatorMiddleware(operatorRepository as never, restaurantRepository);

    await expect(middleware(buildRequest())).rejects.toBeInstanceOf(BillingBlockedError);
  });

  // specs/0175-cobranca-assinatura-asaas REQ-27/AC-21 substitui a isenção antiga por faixa
  // corrente (0042 AC-8, ver `billing.spec.ts`) — `status` só é escrito por
  // `recomputeAccessStatus` a partir de dívida real; gratuito COM dívida real continua bloqueado.
  it('REQ-27/AC-21: restaurante no gratuito com status blocked (dívida real) também é bloqueado', async () => {
    const restaurantRepository = {
      findById: jest.fn().mockResolvedValue(
        buildRestaurant({ referenceMonth: '2026-10', currentTier: 'free', notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked', cycle: 'monthly' }),
      ),
    };
    const middleware = buildRestaurantOperatorMiddleware(operatorRepository as never, restaurantRepository);

    await expect(middleware(buildRequest())).rejects.toBeInstanceOf(BillingBlockedError);
  });

  it('restaurante no gratuito SEM dívida (status ok) nunca é bloqueado', async () => {
    const restaurantRepository = {
      findById: jest.fn().mockResolvedValue(
        buildRestaurant({ referenceMonth: '2026-10', currentTier: 'free', notified75Percent: false, notifiedTierUpgrade: false, status: 'ok', cycle: 'monthly' }),
      ),
    };
    const middleware = buildRestaurantOperatorMiddleware(operatorRepository as never, restaurantRepository);

    await expect(middleware(buildRequest())).resolves.toBeUndefined();
  });
});
