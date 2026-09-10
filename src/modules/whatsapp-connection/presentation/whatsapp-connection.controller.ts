import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IWhatsAppConnectionService } from '../domain/services/i-whatsapp-connection.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — consumido pela seção "Notificações" de
 * `specs/0010-configuracao-restaurante` (a tela em si é de outra spec; esta é só a API).
 */
export class WhatsAppConnectionController extends BaseRouter {
  constructor(
    private readonly whatsAppConnectionService: IWhatsAppConnectionService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    // REQ-11 — inicia o pareamento e devolve o QR (texto bruto, a retaguarda renderiza como
    // imagem); `qr: null` quando já está conectado.
    application.post(
      '/restaurants/me/whatsapp/pairing',
      ...authenticated,
      async (req: Request, res: Response) => {
        const qr = await this.whatsAppConnectionService.startPairing(req.restaurantId!);
        res.json(200, { qr });
      },
    );

    application.get('/restaurants/me/whatsapp/status', ...authenticated, async (req: Request, res: Response) => {
      const connected = await this.whatsAppConnectionService.getConnectionStatus(req.restaurantId!);
      res.json(200, { connected });
    });

    application.del('/restaurants/me/whatsapp', ...authenticated, async (req: Request, res: Response) => {
      await this.whatsAppConnectionService.disconnect(req.restaurantId!);
      res.send(204);
    });
  }
}
