import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { generateUniqueReferralCode } from '../domain/generate-referral-code';
import { IReferralCodeRepository } from '../domain/repositories/referral-code.repository.interface';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';

const REFERRAL_LINK_BASE = 'https://bsdelivery.com.br/?ref=';

/**
 * specs/0110 REQ-1/REQ-2 — "Indique e ganhe" do cliente do app: código e link próprios (criados na
 * primeira vez que a área é aberta), saldo a receber e histórico das indicações.
 */
export class CustomerReferralsController extends BaseRouter {
  constructor(
    private readonly referralCodeRepository: IReferralCodeRepository,
    private readonly referralRepository: IReferralRepository,
    private readonly restaurantRepository: IRestaurantRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/customers/me/referrals', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const customerId = req.user!.uid;
      let code = await this.referralCodeRepository.findByCustomerId(customerId);
      if (!code) {
        code = await generateUniqueReferralCode(this.referralCodeRepository);
        await this.referralCodeRepository.save(customerId, code);
      }

      const [balanceCents, referrals] = await Promise.all([
        this.referralRepository.getPendingBalanceCents(customerId),
        this.referralRepository.findByReferrerCustomerId(customerId),
      ]);
      const referred = await Promise.all(referrals.map((referral) => this.restaurantRepository.findById(referral.referredRestaurantId)));

      res.json(200, {
        referralCode: code,
        referralLink: `${REFERRAL_LINK_BASE}${code}`,
        balanceCents,
        referrals: referrals.map((referral, index) => ({
          id: referral.id,
          referredRestaurantName: referred[index]?.name ?? null,
          rewardCents: referral.rewardCents,
          status: referral.status,
          createdAt: referral.createdAt,
          paidAt: referral.paidAt ?? null,
        })),
      });
    });
  }
}
