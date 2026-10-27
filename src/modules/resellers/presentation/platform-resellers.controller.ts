import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { generateUniqueResellerCode } from '../domain/generate-reseller-code';
import { createResellerSchema, setResellerActiveSchema } from './resellers.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0189-painel-revenda REQ-12 a REQ-16 — painel administrativo (`painel.bsdelivery.com.br`):
 * cadastra revendedores, lista com contagens, abre o detalhe completo de um, ativa/inativa.
 * Protegido pelo mesmo `platformAdminMiddleware` de `PlatformController` (`PLATFORM_ADMIN_EMAILS`).
 */
export class PlatformResellersController extends BaseRouter {
  constructor(
    private readonly resellerRepository: IResellerRepository,
    private readonly prospectRepository: IResellerProspectRepository,
    private readonly clientRepository: IResellerClientRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    // REQ-13 — nome, e-mail, status, contagem de prospects e de clientes efetivados.
    application.get('/platform/resellers', ...adminAuthenticated, async (_req: Request, res: Response) => {
      const resellers = await this.resellerRepository.listAll();
      const rows = await Promise.all(resellers.map(async (reseller) => ({
        ...reseller,
        prospectsCount: (await this.prospectRepository.listByReseller(reseller.id)).length,
        clientsCount: await this.clientRepository.countByReseller(reseller.id),
      })));
      res.json(200, rows);
    });

    // REQ-2/REQ-15.
    application.post('/platform/resellers', ...adminAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(createResellerSchema, req.body);
      const code = await generateUniqueResellerCode(this.resellerRepository);
      const reseller = await this.resellerRepository.create({ ...input, code });
      res.json(201, reseller);
    });

    // REQ-14 — dados do revendedor + prospects completos + clientes efetivados completos.
    application.get('/platform/resellers/:id', ...adminAuthenticated, async (req: Request, res: Response) => {
      const reseller = await this.resellerRepository.findById(req.params.id);
      if (!reseller) throw new NotFoundError('Revendedor não encontrado');

      const [prospects, clients] = await Promise.all([
        this.prospectRepository.listByReseller(reseller.id),
        this.clientRepository.listByReseller(reseller.id),
      ]);
      const restaurants = await Promise.all(clients.map((client) => this.restaurantRepository.findById(client.restaurantId)));

      res.json(200, {
        reseller,
        prospects,
        clients: clients.map((client, index) => ({
          id: client.id,
          restaurantId: client.restaurantId,
          restaurantName: restaurants[index]?.name ?? null,
          origin: client.origin,
          createdAt: client.createdAt,
        })),
      });
    });

    // REQ-16.
    application.patch('/platform/resellers/:id/active', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { isActive } = parseBody(setResellerActiveSchema, req.body);
      const updated = await this.resellerRepository.setActive(req.params.id, isActive);
      if (!updated) throw new NotFoundError('Revendedor não encontrado');
      res.json(200, updated);
    });
  }
}
