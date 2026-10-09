import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { generateCampaignCode } from '../domain/campaign-links';
import { ICampaignOptOutRepository } from '../domain/repositories/campaign-opt-out.repository.interface';
import { ICampaignRepository } from '../domain/repositories/campaign.repository.interface';
import { ICampaignDispatchService } from '../domain/services/i-campaign-dispatch.service';
import { createCampaignSchema } from './campaigns.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0092-campanha-whatsapp-clientes — gestão de campanha é `dono`/`gerente`, mesmo grupo de
 * `CustomersSummaryController`/`CouponsController` (base de clientes/vendas). A rota de
 * descadastro (`POST /campaigns/unsubscribe/:token`) é **pública** — quem acessa é o cliente
 * final pelo link recebido no WhatsApp, não um operador da retaguarda, então não leva
 * `firebaseAuthMiddleware` nem `restaurantOperatorMiddleware`.
 */
export class CampaignsController extends BaseRouter {
  constructor(
    private readonly campaignRepository: ICampaignRepository,
    private readonly campaignOptOutRepository: ICampaignOptOutRepository,
    private readonly campaignDispatchService: ICampaignDispatchService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // REQ-1/REQ-4 — cria a campanha e dispara o envio em segundo plano (sem aguardar, ver
    // `plan.md`): a resposta HTTP não espera o envio pra todo mundo terminar.
    application.post('/restaurants/me/campaigns', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(createCampaignSchema, req.body);
      const campaign = await this.campaignRepository.create(req.restaurantId!, {
        message: payload.message,
        imageUrl: payload.imageUrl,
        campaignCode: generateCampaignCode(),
        excludedCustomerIds: payload.excludedCustomerIds ?? [],
      });
      this.campaignDispatchService.dispatch(campaign.id).catch((error) => {
        console.error(`[campaigns] dispatch da campanha ${campaign.id} falhou:`, error);
      });
      res.json(201, campaign);
    });

    // REQ-7 — histórico, mais recente primeiro.
    application.get('/restaurants/me/campaigns', ...authenticated, async (req: Request, res: Response) => {
      const campaigns = await this.campaignRepository.findManyByRestaurant(req.restaurantId!);
      res.json(200, campaigns);
    });

    // REQ-5 — público, sem autenticação. Idempotente (ver `CampaignOptOutMongooseRepository`).
    application.post('/campaigns/unsubscribe/:token', async (req: Request, res: Response) => {
      const result = await this.campaignOptOutRepository.optOutByToken(req.params.token);
      if (!result) throw new NotFoundError('Link de descadastro inválido');
      res.json(200, { unsubscribed: true });
    });
  }
}
