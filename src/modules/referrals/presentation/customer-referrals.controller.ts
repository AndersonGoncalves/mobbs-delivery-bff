import type { Request, Response, Server } from 'restify';
import { z } from 'zod';
import { BadRequestError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { decryptField, encryptField } from '../../../shared/crypto/field-encryption';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { generateUniqueReferralCode } from '../domain/generate-referral-code';
import { CURRENT_TERMS_VERSION, maskPixKey, normalizePixKey } from '../domain/pix-key';
import { ICustomerPixKeyRepository } from '../domain/repositories/customer-pix-key.repository.interface';
import { IReferralCodeRepository } from '../domain/repositories/referral-code.repository.interface';
import { IReferralRepository } from '../domain/repositories/referral.repository.interface';

const REFERRAL_LINK_BASE = 'https://bsdelivery.com.br/gratis?ref=';

const pixKeySchema = z.object({
  type: z.enum(['cpf', 'phone', 'email', 'random']),
  key: z.string().min(1).max(100),
  /** specs/0112 — o cliente aceitou esta versão dos termos (texto do app). */
  termsVersion: z.literal(CURRENT_TERMS_VERSION),
});

/**
 * specs/0110 REQ-1/REQ-2 — "Indique e ganhe" do cliente do app: código e link próprios (criados na
 * primeira vez que a área é aberta), saldo a receber e histórico das indicações.
 */
export class CustomerReferralsController extends BaseRouter {
  constructor(
    private readonly referralCodeRepository: IReferralCodeRepository,
    private readonly referralRepository: IReferralRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly pixKeyRepository: ICustomerPixKeyRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0112 REQ-1/REQ-2/REQ-10 — cadastra ou troca a chave Pix, exigindo o aceite da versão atual dos termos.
    application.put('/customers/me/pix-key', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const payload = parseBody(pixKeySchema, req.body);
      const normalized = normalizePixKey(payload.type, payload.key);
      if (!normalized) throw new BadRequestError('Chave Pix inválida para o tipo escolhido');

      const now = new Date();
      await this.pixKeyRepository.save({
        customerId: req.user!.uid,
        type: payload.type,
        encryptedValue: encryptField(normalized),
        termsVersionAccepted: payload.termsVersion,
        acceptedAt: now,
        updatedAt: now,
      });
      res.json(200, { type: payload.type, masked: maskPixKey(normalized), acceptedAt: now });
    });

    // specs/0112 REQ-7 — remove a chave a pedido do cliente.
    application.del('/customers/me/pix-key', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      await this.pixKeyRepository.deleteByCustomerId(req.user!.uid);
      res.send(204);
    });

    application.get('/customers/me/referrals', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const customerId = req.user!.uid;
      let code = await this.referralCodeRepository.findByCustomerId(customerId);
      if (!code) {
        code = await generateUniqueReferralCode(this.referralCodeRepository);
        await this.referralCodeRepository.save(customerId, code);
      }

      const [balanceCents, referrals, pixRecord] = await Promise.all([
        this.referralRepository.getPendingBalanceCents(customerId),
        this.referralRepository.findByReferrerCustomerId(customerId),
        this.pixKeyRepository.findByCustomerId(customerId),
      ]);
      const referred = await Promise.all(referrals.map((referral) => this.restaurantRepository.findById(referral.referredRestaurantId)));

      res.json(200, {
        referralCode: code,
        referralLink: `${REFERRAL_LINK_BASE}${code}`,
        balanceCents,
        // specs/0112 REQ-4 — a chave volta mascarada; a completa só existe no painel do dono.
        pixKey: pixRecord ? { type: pixRecord.type, masked: maskPixKey(decryptField(pixRecord.encryptedValue)) } : null,
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
