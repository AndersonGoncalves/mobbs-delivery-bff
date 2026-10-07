import type { Request, Response, Server } from 'restify';
import { z } from 'zod';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import type { IBillingSettingsRepository } from '../domain/repositories/billing-settings.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const billingSettingsSchema = z
  .object({
    freeLimitCents: z.number().int().min(0),
    proLimitCents: z.number().int().min(0),
    proMonthlyPriceCents: z.number().int().min(0),
    premiumMonthlyPriceCents: z.number().int().min(0),
    annualMultiplier: z.number().int().min(1),
  })
  .refine((value) => value.proLimitCents > value.freeLimitCents, {
    message: 'O limite da faixa Pro deve ser maior que o da faixa Gratuita',
    path: ['proLimitCents'],
  })
  .refine((value) => value.premiumMonthlyPriceCents > value.proMonthlyPriceCents, {
    message: 'A mensalidade do plano Premium deve ser maior que a do plano Pro',
    path: ['premiumMonthlyPriceCents'],
  });

/**
 * specs/0113-parametrizacao-faixas-cobranca REQ-2/REQ-3/REQ-4/REQ-5/REQ-6 — limites/mensalidades
 * de cobrança (`specs/0042`) deixam de ser constantes fixas no código. `/billing-settings/public`
 * é a única rota sem autenticação deste módulo, de propósito (ver `plan.md`, ADR): é a mesma
 * tabela de preços que já era texto fixo, público, na landing antes desta spec.
 */
export class BillingSettingsController extends BaseRouter {
  constructor(
    private readonly billingSettingsRepository: IBillingSettingsRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/billing-settings/public', async (_req: Request, res: Response) => {
      const settings = await this.billingSettingsRepository.get();
      res.json(200, {
        freeLimitCents: settings.freeLimitCents,
        proLimitCents: settings.proLimitCents,
        proMonthlyPriceCents: settings.proMonthlyPriceCents,
        premiumMonthlyPriceCents: settings.premiumMonthlyPriceCents,
      });
    });

    application.get('/platform/billing-settings', ...adminAuthenticated, async (_req: Request, res: Response) => {
      res.json(200, await this.billingSettingsRepository.get());
    });

    application.put('/platform/billing-settings', ...adminAuthenticated, async (req: Request, res: Response) => {
      const settings = parseBody(billingSettingsSchema, req.body);
      res.json(200, await this.billingSettingsRepository.update(settings));
    });
  }
}
