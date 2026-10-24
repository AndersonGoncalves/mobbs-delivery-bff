import type { Request, Response, Server } from 'restify';

import { environment } from '../../../shared/config/environment';
import { BaseRouter } from '../../../shared/router/base.router';

export class SupportController extends BaseRouter {
  initializeRoutes(application: Server): void {
    application.get('/support/public', async (_req: Request, res: Response) => {
      const { whatsapp, email, businessHours, trainingPriceCents, trainingUnlimitedItems } = environment.support;
      res.json(200, { whatsapp, email, businessHours, trainingPriceCents, trainingUnlimitedItems });
    });
  }
}
