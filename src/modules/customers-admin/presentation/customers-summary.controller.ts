import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerSummaryRepository } from '../domain/repositories/customer-summary.repository.interface';
import { customersSummaryQuerySchema } from './customers-summary.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0016-clientes-retaguarda — feature **somente leitura**: clientes que já pediram no
 * restaurante do operador logado (REQ-1/REQ-2/REQ-4) e o histórico de pedidos de um cliente
 * específico, sempre escopado por `req.restaurantId` (nunca por parâmetro de rota), mesmo padrão
 * de isolamento de `suppliers`/`raw-materials`/`orders` (`restaurants/me/...`).
 *
 * Rotas prefixadas com `/restaurants/me/` (não `/customers-summary` solto, como o `plan.md`
 * original sugeria) pra seguir o mesmo padrão de isolamento multi-tenant de todo o resto do BFF
 * — ver `specs/0016-clientes-retaguarda/tasks.md`, "Notas de implementação".
 */
export class CustomersSummaryController extends BaseRouter {
  constructor(
    private readonly customerSummaryRepository: ICustomerSummaryRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // Pedido explícito do usuário (follow-up) — "ver endereços" do cliente (mesmo padrão de "ver
    // pedidos").
    private readonly addressRepository: IAddressRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-3/T005 — clientes é `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // AC-1/AC-2/AC-4
    application.get('/restaurants/me/customers-summary', ...authenticated, async (req: Request, res: Response) => {
      const { search, fromDate, toDate } = parseBody(customersSummaryQuerySchema, req.query);
      // `toDate` inclusive até o fim do dia (23:59:59.999) — um pedido feito às 22h no último dia
      // do período não pode ficar de fora por `toDate` ter sido interpretado como meia-noite.
      const summaries = await this.customerSummaryRepository.listByRestaurant(
        req.restaurantId!,
        search,
        fromDate ? new Date(`${fromDate}T00:00:00.000`) : undefined,
        toDate ? new Date(`${toDate}T23:59:59.999`) : undefined,
      );
      res.json(200, summaries);
    });

    // AC-3 — `findManyByCustomerAndRestaurant` já garante o isolamento (REQ-3); sem checagem
    // extra de existência do cliente aqui, mesmo padrão de "lista vazia" já usado no resto do BFF
    // quando um filtro não encontra nada (não é um 404, é uma resposta 200 com `[]`).
    application.get(
      '/restaurants/me/customers-summary/:customerId/orders',
      ...authenticated,
      async (req: Request, res: Response) => {
        const orders = await this.orderRepository.findManyByCustomerAndRestaurant(req.params.customerId, req.restaurantId!);
        res.json(200, orders);
      },
    );

    // Pedido explícito do usuário (follow-up) — "ver endereços" do cliente, mesmo botão de "ver
    // pedidos". `Address` não é escopada por restaurante (docs/architecture/data-model.md
    // §Address), então — diferente da rota de pedidos acima, que já isola pela própria query —
    // aqui é preciso confirmar explicitamente que o cliente pediu NESTE restaurante antes de
    // devolver o endereço, pra um operador não conseguir ver o endereço de qualquer customerId
    // só adivinhando o id (a mesma checagem que `findManyByCustomerAndRestaurant` já faz).
    application.get(
      '/restaurants/me/customers-summary/:customerId/addresses',
      ...authenticated,
      async (req: Request, res: Response) => {
        const orders = await this.orderRepository.findManyByCustomerAndRestaurant(req.params.customerId, req.restaurantId!);
        if (orders.length === 0) {
          res.json(200, []);
          return;
        }
        const addresses = await this.addressRepository.listByCustomer(req.params.customerId);
        res.json(200, addresses);
      },
    );
  }
}
