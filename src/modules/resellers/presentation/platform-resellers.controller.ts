import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { IResellerCommissionRepository } from '../domain/repositories/reseller-commission.repository.interface';
import { generateUniqueResellerCode } from '../domain/generate-reseller-code';
import { createResellerSchema, setResellerActiveSchema } from './resellers.schemas';
import { buildCommissionsSummary } from './build-commissions-summary';

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
    private readonly commissionRepository: IResellerCommissionRepository,
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

    // specs/0205-comissao-revendedor REQ-13 — comissões de qualquer revendedor + totais.
    application.get('/platform/resellers/:id/commissions', ...adminAuthenticated, async (req: Request, res: Response) => {
      const reseller = await this.resellerRepository.findById(req.params.id);
      if (!reseller) throw new NotFoundError('Revendedor não encontrado');
      res.json(200, await buildCommissionsSummary(reseller.id, this.commissionRepository, this.restaurantRepository));
    });

    // REQ-11 — mesmo padrão idempotente de `PlatformReferralsController` (`markPaid` só troca
    // status/data se ainda `pendente`; cancelada não pode ser paga).
    application.patch('/platform/resellers/commissions/:commissionId/paid', ...adminAuthenticated, async (req: Request, res: Response) => {
      const commission = await this.commissionRepository.findById(req.params.commissionId);
      if (!commission) throw new NotFoundError('Comissão não encontrada');
      if (commission.status === 'cancelada') throw new ConflictError('Comissão cancelada não pode ser marcada como paga');

      const updated = await this.commissionRepository.markPaid(commission.id, new Date());
      res.json(200, updated ?? commission);
    });
  }
}
