import type { Request, Response, Server } from 'restify';
import { BadRequestError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { updateCustomerAllowedPaymentMethodsSchema } from './customer-payment-methods.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0171-meios-pagamento-por-cliente REQ-2/REQ-4/REQ-5 — único jeito de alterar
 * `Customer.allowedPaymentMethods`; a rota do próprio cliente (`PUT /customers/me`,
 * `CustomersController`) não aceita esse campo (allowlist explícita em
 * `updateCustomerProfileSchema`), então essa restrição só pode nascer aqui, pela retaguarda.
 *
 * Mesmo padrão de guard de `CustomerBlockingController` (dono/gerente, não `financeiro` — mexe no
 * cadastro do cliente, não é consulta financeira). Rota aninhada em `/restaurants/me/customers/...`
 * (não dentro do módulo `customers`, que é só o fluxo do próprio cliente autenticado por Firebase,
 * sem conceito de `restaurantId`) — ao lado de `CustomersSummaryController`, que já é a leitura
 * administrativa de clientes por restaurante; esta classe fica em um arquivo próprio (não
 * adicionada à `CustomersSummaryController`) porque aquela é documentada como "somente leitura".
 */
export class CustomerPaymentMethodsController extends BaseRouter {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly restaurantRepository: IRestaurantRepository,
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

    // AC-2/AC-3/AC-5 — valores enviados precisam estar todos em `acceptedPaymentMethods` do
    // restaurante do operador logado (REQ-5); `null`/array vazio sempre é aceito (limpa a
    // restrição, nunca precisa estar "dentro" de nada).
    application.put(
      '/restaurants/me/customers/:customerId/payment-methods',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { allowedPaymentMethods } = parseBody(updateCustomerAllowedPaymentMethodsSchema, req.body);

        const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
        if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

        if (allowedPaymentMethods && allowedPaymentMethods.length > 0) {
          const notAccepted = allowedPaymentMethods.filter(
            (method) => !restaurant.acceptedPaymentMethods.includes(method),
          );
          if (notAccepted.length > 0) {
            throw new BadRequestError(
              `Este restaurante não aceita: ${notAccepted.join(', ')}. Habilite no restaurante antes de permitir para o cliente.`,
            );
          }
        }

        const customer = await this.customerRepository.updateAllowedPaymentMethods(
          req.params.customerId,
          allowedPaymentMethods,
        );
        if (!customer) throw new NotFoundError('Cliente não encontrado');

        res.json(200, customer);
      },
    );
  }
}
