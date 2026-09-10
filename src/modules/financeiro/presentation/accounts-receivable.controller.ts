import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IAccountReceivableRepository } from '../domain/repositories/account-receivable.repository.interface';
import { markAccountReceivablePaidSchema, saveAccountReceivableSchema } from './financeiro.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** specs/0014-financeiro REQ-3 — mesma forma de `AccountsPayableController`, pra recebimentos. */
export class AccountsReceivableController extends BaseRouter {
  constructor(
    private readonly accountReceivableRepository: IAccountReceivableRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-4/T006 — financeiro é `dono`/`financeiro` (sem `gerente`).
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'financeiro'),
    ];

    // AC-3
    application.get('/restaurants/me/accounts-receivable', ...authenticated, async (req: Request, res: Response) => {
      const accounts = await this.accountReceivableRepository.listByRestaurant(req.restaurantId!);
      res.json(200, accounts);
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
        const { receivedValue, receivedAt } = parseBody(markAccountReceivablePaidSchema, req.body);
        await this.findOwnedAccount(req.params.id, req.restaurantId!);
        const account = await this.accountReceivableRepository.markAsReceived(
          req.params.id,
          receivedValue,
          receivedAt ? new Date(receivedAt) : new Date(),
        );
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
