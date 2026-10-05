import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const REFERRAL_LINK_BASE = 'https://bsdelivery.com.br/?ref=';

/**
 * specs/0043-programa-indicacao REQ-2/REQ-5 — "Indique e ganhe" da retaguarda: código e link do
 * próprio restaurante, histórico de indicações e saldo a receber. Qualquer operador logado vê
 * (nunca um parâmetro de rota), mesmo padrão do resto de `/restaurants/me/...`.
 */
export class ReferralsController extends BaseRouter {
  constructor(
    private readonly referralRepository: IReferralRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/restaurants/me/referrals', firebaseAuthMiddleware, this.restaurantOperatorMiddleware, async (req: Request, res: Response) => {
      const restaurantId = req.restaurantId!;
      const [restaurant, referrals, balanceCents] = await Promise.all([
        this.restaurantRepository.findById(restaurantId),
        this.referralRepository.findByReferrerRestaurantId(restaurantId),
        this.referralRepository.getBalanceCents(restaurantId),
      ]);
      const referred = await Promise.all(referrals.map((referral) => this.restaurantRepository.findById(referral.referredRestaurantId)));

      const code = restaurant?.referralCode ?? null;
      res.json(200, {
        referralCode: code,
        referralLink: code ? `${REFERRAL_LINK_BASE}${code}` : null,
        balanceCents,
        referrals: referrals.map((referral, index) => ({
          id: referral.id,
          referredRestaurantName: referred[index]?.name ?? null,
          rewardCents: referral.rewardCents,
          createdAt: referral.createdAt,
        })),
      });
    });
  }
}
