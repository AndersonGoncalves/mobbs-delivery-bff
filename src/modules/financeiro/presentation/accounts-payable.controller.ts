import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IAccountPayableRepository } from '../domain/repositories/account-payable.repository.interface';
import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { markAccountPayablePaidSchema, saveAccountPayableSchema } from './financeiro.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0014-financeiro REQ-1/REQ-2 — títulos a pagar do restaurante do operador logado, mesmo
 * padrão de isolamento de `restaurants.me.*` (`restaurantOperatorMiddleware`, injetado por fora,
 * ver `main.ts`) já usado em `raw-materials`/`orders`.
 *
 * Pedido explícito do usuário — `affectsCashRegister` (default `true` quando omitido) no corpo de
 * `.../pay`: quando `true` e existe uma sessão de caixa aberta, lança uma saída manual no Caixa
 * (mesmo `ICashRegisterRepository.addMovement` usado pelo lançamento manual de
 * `CashRegisterController`); quando `false`, ou sem sessão aberta, só marca o título como pago,
 * sem tocar no caixa (nunca força abertura de sessão).
 */
export class AccountsPayableController extends BaseRouter {
  constructor(
    private readonly accountPayableRepository: IAccountPayableRepository,
    private readonly cashRegisterRepository: ICashRegisterRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // Contas a pagar: dono e gerente.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // AC-1
    application.get('/restaurants/me/accounts-payable', ...authenticated, async (req: Request, res: Response) => {
      const accounts = await this.accountPayableRepository.listByRestaurant(req.restaurantId!);
      res.json(200, accounts);
    });

    // AC-1
    application.post('/restaurants/me/accounts-payable', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveAccountPayableSchema, req.body);
      const account = await this.accountPayableRepository.create(req.restaurantId!, payload);
      res.json(201, account);
    });

    // REQ-1 (editar)
    application.put(
      '/restaurants/me/accounts-payable/:id',
      ...authenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAccountPayableSchema, req.body);
        await this.findOwnedAccount(req.params.id, req.restaurantId!);
        const account = await this.accountPayableRepository.update(req.params.id, payload);
        res.json(200, account);
      },
    );

    // AC-2
    application.patch(
      '/restaurants/me/accounts-payable/:id/pay',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { paidValue, paidAt, affectsCashRegister } = parseBody(markAccountPayablePaidSchema, req.body);
        const existingAccount = await this.findOwnedAccount(req.params.id, req.restaurantId!);
        const account = await this.accountPayableRepository.markAsPaid(
          req.params.id,
          paidValue,
          paidAt ? new Date(paidAt) : new Date(),
        );
        if (affectsCashRegister ?? true) {
          const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(req.restaurantId!);
          if (session) {
            await this.cashRegisterRepository.addMovement(session.id, {
              type: 'saida',
              amount: paidValue,
              description: `Pagamento: ${existingAccount.description}`,
            });
          }
        }
        res.json(200, account);
      },
    );
  }

  private async findOwnedAccount(id: string, restaurantId: string) {
    const account = await this.accountPayableRepository.findById(id);
    if (!account || account.restaurantId !== restaurantId) {
      throw new NotFoundError('Título a pagar não encontrado');
    }
    return account;
  }
}
