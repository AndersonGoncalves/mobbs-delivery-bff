import type { Request, Response, Server } from 'restify';
import { z } from 'zod';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import type { ISupportSettingsRepository } from '../domain/support-settings';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const whatsappSchema = z.string().trim().regex(/^[1-9]\d{9,14}$/, 'Informe WhatsApp com DDI e DDD, somente números');
const centsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const supportSettingsSchema = z.object({
  whatsapp: whatsappSchema,
  commercialWhatsapp: whatsappSchema,
  financialWhatsapp: whatsappSchema,
  email: z.string().trim().max(254).email(),
  businessHours: z.string().trim().min(1).max(500),
  trainingPriceCents: centsSchema,
  trainingUnlimitedItems: z.boolean(),
  trainingIncludedItems: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  trainingExtraItemPriceCents: centsSchema,
}).strict();

export class SupportController extends BaseRouter {
  constructor(
    private readonly settingsRepository: ISupportSettingsRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/support/public', async (_req: Request, res: Response) => {
      res.json(200, await this.settingsRepository.get());
    });
    const adminAuthenticated = [firebaseAuthMiddleware, this.platformAdminMiddleware];
    application.get('/platform/support-settings', ...adminAuthenticated, async (_req: Request, res: Response) => {
      res.json(200, await this.settingsRepository.get());
    });
    application.put('/platform/support-settings', ...adminAuthenticated, async (req: Request, res: Response) => {
      const settings = parseBody(supportSettingsSchema, req.body);
      res.json(200, await this.settingsRepository.update(settings));
    });
  }
}
