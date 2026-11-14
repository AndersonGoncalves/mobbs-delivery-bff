import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { resolvePagination } from '../../../shared/http/pagination';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IAccountReceivableRepository } from '../domain/repositories/account-receivable.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { accountListQuerySchema, markAccountReceivablePaidSchema, saveAccountReceivableSchema } from './financeiro.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0014-financeiro REQ-3 — mesma forma de `AccountsPayableController`, pra recebimentos.
 *
 * Pedido explícito do usuário — `affectsCashRegister` (default `true` quando omitido) no corpo de
 * `.../receive`: mesma regra de `AccountsPayableController` (ver comentário lá), só que lança uma
 * entrada manual no Caixa em vez de saída.
 */
export class AccountsReceivableController extends BaseRouter {
  constructor(
    private readonly accountReceivableRepository: IAccountReceivableRepository,
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // Contas a receber: dono e gerente.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // AC-3
    // Achado de performance da auditoria pré-produção (31/10/2026) — `from`/`to` opcionais
    // (ver `accountListQuerySchema`); sem eles, `listByRestaurant` já aplica um default que
    // evita carregar o histórico inteiro de anos.
    // Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
    // clientes e estoque": mesmo padrão de `AccountsPayableController`.
    application.get('/restaurants/me/accounts-receivable', ...authenticated, async (req: Request, res: Response) => {
      const query = parseBody(accountListQuerySchema, req.query ?? {});
      const filters = {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        search: query.search,
      };
      const pagination = resolvePagination(query);
      if (!pagination) {
        res.json(200, await this.accountReceivableRepository.listByRestaurant(req.restaurantId!, filters));
        return;
      }
      const { items, total } = await this.accountReceivableRepository.listByRestaurantPage(req.restaurantId!, pagination, filters);
      res.header('X-Total-Count', String(total));
      res.json(200, items);
    });

    // AC-3
    application.post('/restaurants/me/accounts-receivable', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveAccountReceivableSchema, req.body);
      const account = await this.accountReceivableRepository.create(req.restaurantId!, payload);
      res.json(201, account);
    });

    // REQ-3 (editar)
    application.put(
      '/restaurants/me/accounts-receivable/:id',
      ...authenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAccountReceivableSchema, req.body);
        await this.findOwnedAccount(req.params.id, req.restaurantId!);
        const account = await this.accountReceivableRepository.update(req.params.id, payload);
        res.json(200, account);
      },
    );

    // REQ-3 (marcar como recebido, mesma lógica de REQ-2)
    application.patch(
      '/restaurants/me/accounts-receivable/:id/receive',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { receivedValue, receivedAt, affectsCashRegister, paymentMethod } = parseBody(markAccountReceivablePaidSchema, req.body);
        const existingAccount = await this.findOwnedAccount(req.params.id, req.restaurantId!);
        const account = await this.accountReceivableRepository.markAsReceived(
          req.params.id,
          receivedValue,
          receivedAt ? new Date(receivedAt) : new Date(),
        );
        if (affectsCashRegister ?? true) {
          const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
          if (session) {
            await this.cashRegisterRepository.addMovement(session.id, {
              type: 'entrada',
              amount: receivedValue,
              description: `Recebimento: ${existingAccount.description}`,
              paymentMethod: paymentMethod ?? 'cash',
            });
          }
        }
        res.json(200, account);
      },
    );
  }

  private async findOwnedAccount(id: string, restaurantId: string) {
    const account = await this.accountReceivableRepository.findById(id);
    if (!account || account.restaurantId !== restaurantId) {
      throw new NotFoundError('Título a receber não encontrado');
    }
    return account;
  }
}
