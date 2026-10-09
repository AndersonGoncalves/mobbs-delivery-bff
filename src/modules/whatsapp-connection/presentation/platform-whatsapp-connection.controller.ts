import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IPlatformWhatsAppConnectionService } from '../domain/services/i-platform-whatsapp-connection.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0124-campanha-whatsapp-prospects REQ-2 — pareamento da sessão de WhatsApp da plataforma
 * (mesmo padrão de `WhatsAppConnectionController`, specs/0013/0067), mas sem `restaurantId` —
 * sessão única, protegida por `platformAdminMiddleware` (specs/0106 REQ-1) em vez de
 * `restaurantOperatorMiddleware`.
 */
export class PlatformWhatsAppConnectionController extends BaseRouter {
  constructor(
    private readonly platformWhatsAppConnectionService: IPlatformWhatsAppConnectionService,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    // REQ-2 — inicia o pareamento e devolve o QR (texto bruto); `qr: null` quando já conectado.
    application.post('/platform/whatsapp/pairing', ...adminAuthenticated, async (_req: Request, res: Response) => {
      const qr = await this.platformWhatsAppConnectionService.startPairing();
      res.json(200, { qr });
    });

    application.get('/platform/whatsapp/status', ...adminAuthenticated, async (_req: Request, res: Response) => {
      const connected = await this.platformWhatsAppConnectionService.getConnectionStatus();
      res.json(200, { connected });
    });

    application.del('/platform/whatsapp', ...adminAuthenticated, async (_req: Request, res: Response) => {
      await this.platformWhatsAppConnectionService.disconnect();
      res.send(204);
    });
  }
}
