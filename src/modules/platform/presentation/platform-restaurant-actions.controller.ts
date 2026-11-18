import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { setActiveSchema, updateSlugSchema } from '../../restaurants/presentation/restaurants.schemas';
import { ICashRegisterRepository } from '../../financeiro/domain/repositories/cash-register.repository.interface';
import { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026) — "tela de suporte", 2ª leva: mais 4 ações pontuais
 * que hoje só o dono/gerente faz de dentro do próprio restaurante, acessíveis agora pelo menu
 * "⋮" de `PlatformRestaurantsPage` (admin escolhe o restaurante, age sem logar como ele):
 * reabrir o último caixa fechado, abrir/fechar o restaurante manualmente, forçar desconexão do
 * WhatsApp e editar o slug. Reaproveita os mesmos repositórios/serviços das rotas
 * `/restaurants/me/...` equivalentes (`CashRegisterController`/`RestaurantsController`/
 * `WhatsAppConnectionController`) — só muda de onde vem o `restaurantId` (`:id` da URL) e quem
 * pode chamar (`platformAdminMiddleware`).
 *
 * Nunca confundir com o `blocked` de `PlatformRestaurantsPage` (ação "BLOQUEAR", flag de
 * inadimplência/suspensão administrativa) — `isActive` aqui é o "aberto/fechado" operacional do
 * próprio restaurante, outro campo, outra regra.
 */
export class PlatformRestaurantActionsController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly whatsAppConnectionService: IWhatsAppConnectionService,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    async function requireRestaurant(restaurantRepository: IRestaurantRepository, id: string) {
      const restaurant = await restaurantRepository.findById(id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      return restaurant;
    }

    application.get('/platform/restaurants/:id/active', ...adminAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await requireRestaurant(this.restaurantRepository, req.params.id);
      res.json(200, { isActive: restaurant.isActive });
    });

    application.patch('/platform/restaurants/:id/active', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const { isActive } = parseBody(setActiveSchema, req.body);
      const restaurant = await this.restaurantRepository.setActive(req.params.id, isActive);
      res.json(200, { id: restaurant.id, isActive: restaurant.isActive });
    });

    application.put('/platform/restaurants/:id/slug', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const { slug } = parseBody(updateSlugSchema, req.body);
      const restaurant = await this.restaurantRepository.updateSlug(req.params.id, slug);
      res.json(200, { id: restaurant.id, slug: restaurant.slug });
    });

    application.get('/platform/restaurants/:id/whatsapp/status', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const connected = await this.whatsAppConnectionService.getConnectionStatus(req.params.id);
      res.json(200, { connected });
    });

    application.del('/platform/restaurants/:id/whatsapp', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.whatsAppConnectionService.disconnect(req.params.id);
      res.send(204);
    });

    // Mesma validação do `POST /restaurants/me/cash-register/:id/reopen` (`CashRegisterController`):
    // só reabre se o mais recente estiver `fechado` de fato e não houver nenhum caixa `aberto`
    // pendente (nunca duas sessões abertas ao mesmo tempo) — só muda o jeito de achar a sessão
    // (mais recente fechada do restaurante, não um `:id` que o admin precisaria já saber).
    application.get('/platform/restaurants/:id/cash-register/latest-closed', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const session = await this.cashRegisterRepository.findLatestClosedSession(req.params.id);
      res.json(200, { session });
    });

    application.post('/platform/restaurants/:id/cash-register/reopen', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const session = await this.cashRegisterRepository.findLatestClosedSession(req.params.id);
      if (!session) throw new NotFoundError('Nenhum caixa fechado encontrado pra reabrir');
      const openSessions = await this.cashRegisterRepository.findPendingSessions(req.params.id);
      if (openSessions.length > 0) {
        throw new ConflictError('Existe um caixa aberto no momento — feche-o antes de reabrir outro.');
      }
      const reopened = await this.cashRegisterRepository.reopen(session.id, req.user?.email);
      res.json(200, reopened);
    });
  }
}
