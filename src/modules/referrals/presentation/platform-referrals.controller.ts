import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IReferral, ReferralStatus } from '../domain/entities/referral.entity';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0110 REQ-7/REQ-8 — painel da plataforma: lista as indicações de clientes com o contato de
 * quem indicou, e marca cada recompensa como paga. Protegido pelo mesmo middleware de admin do
 * `specs/0106` (`PLATFORM_ADMIN_EMAILS`).
 */
export class PlatformReferralsController extends BaseRouter {
  constructor(
    private readonly referralRepository: IReferralRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/referrals', ...adminAuthenticated, async (req: Request, res: Response) => {
      const rawStatus = typeof req.query?.status === 'string' ? req.query.status : undefined;
      const status: ReferralStatus | undefined = rawStatus === 'pendente' || rawStatus === 'pago' ? rawStatus : undefined;
      const referrals = await this.referralRepository.listAll({ status });

      const rows = await Promise.all(referrals.map((referral) => this.buildRow(referral)));
      res.json(200, rows);
    });

    application.patch('/platform/referrals/:id/paid', ...adminAuthenticated, async (req: Request, res: Response) => {
      const referral = await this.referralRepository.findById(req.params.id);
      if (!referral) throw new NotFoundError('Indicação não encontrada');

      // Já paga: devolve como está, sem trocar a data do pagamento original (REQ-7).
      const updated = await this.referralRepository.markPaid(referral.id, new Date());
      res.json(200, await this.buildRow(updated ?? referral));
    });
  }

  private async buildRow(referral: IReferral) {
    const [customer, restaurant] = await Promise.all([
      this.customerRepository.findById(referral.referrerCustomerId),
      this.restaurantRepository.findById(referral.referredRestaurantId),
    ]);
    return {
      id: referral.id,
      status: referral.status,
      rewardCents: referral.rewardCents,
      createdAt: referral.createdAt,
      paidAt: referral.paidAt ?? null,
      // Sem cadastro de cliente (nunca fez o primeiro PUT), o painel mostra só o id.
      referrer: {
        id: referral.referrerCustomerId,
        name: customer?.name ?? null,
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
      },
      referredRestaurant: { id: referral.referredRestaurantId, name: restaurant?.name ?? null },
    };
  }
}
