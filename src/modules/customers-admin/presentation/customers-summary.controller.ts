import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';
import { resolvePagination } from '../../../shared/http/pagination';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IAddress, ICustomer } from '../../customers/domain/entities/customer.entity';
import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { saveAddressSchema } from '../../customers/presentation/customers.schemas';
import { ICustomerSummaryRepository } from '../domain/repositories/customer-summary.repository.interface';
import { CustomerBalanceService } from '../../customer-balance/domain/services/customer-balance.service';
import {
  createCustomerByRestaurantSchema,
  customersSummaryQuerySchema,
  updateCustomerByRestaurantSchema,
} from './customers-summary.schemas';

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
    // specs/0131-cashback-app REQ-8 / specs/0132-programa-fidelidade-app REQ-6.
    private readonly customerBalanceService: CustomerBalanceService,
    // (achado real, pedido explícito do usuário) — "NOVO" em Clientes (`createByRestaurant`).
    private readonly customerRepository: ICustomerRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-3/T005 — clientes é `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    // Pedido explícito do usuário — editar dados do cliente e incluir/alterar endereços pela
    // retaguarda; mesmo papel (mais restrito que a leitura acima, que inclui financeiro) de
    // `POST /restaurants/me/customers` (cadastro manual), nunca financeiro.
    const writeAccess: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // (achado real, pedido explícito do usuário) — "NOVO" em Clientes: cadastro manual ANTES de
    // qualquer pedido, mesmo papel de escrita de `CustomerPaymentMethodsController`
    // (dono/gerente — mais restrito que a leitura acima, que inclui financeiro).
    application.post(
      '/restaurants/me/customers',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
      async (req: Request, res: Response) => {
        const { name, phone } = parseBody(createCustomerByRestaurantSchema, req.body);
        const customer = await this.customerRepository.createByRestaurant(req.restaurantId!, name, normalizePhoneNumber(phone));
        res.json(201, { customerId: customer.id, name: customer.name, phone: customer.phone });
      },
    );

    // Pedido explícito do usuário — editar nome/telefone de um cliente já existente deste
    // restaurante (o mesmo cadastrado manualmente acima ou um cliente que já pediu aqui).
    // `upsertProfile` nunca cria de novo aqui — `ensureCustomerBelongsToRestaurant` já garantiu
    // que o documento existe e pertence a este restaurante antes de chegar aqui.
    application.put('/restaurants/me/customers-summary/:customerId', ...writeAccess, async (req: Request, res: Response) => {
      const existing = await this.ensureCustomerBelongsToRestaurant(req.params.customerId, req.restaurantId!);
      const { name, phone } = parseBody(updateCustomerByRestaurantSchema, req.body);
      const customer = await this.customerRepository.upsertProfile(req.params.customerId, {
        name: name ?? existing.name,
        email: existing.email,
        phone: phone ? normalizePhoneNumber(phone) : existing.phone,
        document: existing.document,
      });
      res.json(200, { customerId: customer.id, name: customer.name, phone: customer.phone });
    });

    // AC-1/AC-2/AC-4
    // Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
    // histórico inteiro": `page`/`pageSize` OPCIONAIS (ver `resolvePagination`), mesmo padrão de
    // `/restaurants/me/products` — omitidos, devolve a lista inteira exatamente como antes; só
    // informados, pagina de verdade no servidor e o total real vai no header `X-Total-Count`
    // (nunca no corpo, que continua sendo só o array — contrato igual nos dois casos).
    application.get('/restaurants/me/customers-summary', ...authenticated, async (req: Request, res: Response) => {
      const query = parseBody(customersSummaryQuerySchema, req.query);
      // `toDate` inclusive até o fim do dia (23:59:59.999) — um pedido feito às 22h no último dia
      // do período não pode ficar de fora por `toDate` ter sido interpretado como meia-noite.
      const fromDate = query.fromDate ? new Date(`${query.fromDate}T00:00:00.000`) : undefined;
      const toDate = query.toDate ? new Date(`${query.toDate}T23:59:59.999`) : undefined;
      const pagination = resolvePagination(query);
      if (!pagination) {
        const summaries = await this.customerSummaryRepository.listByRestaurant(req.restaurantId!, query.search, fromDate, toDate);
        res.json(200, summaries);
        return;
      }
      const { items, total } = await this.customerSummaryRepository.listByRestaurantPage(
        req.restaurantId!,
        pagination,
        query.search,
        fromDate,
        toDate,
      );
      res.header('X-Total-Count', String(total));
      res.json(200, items);
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

    // Pedido explícito do usuário — incluir endereço novo pro cliente, pela retaguarda.
    application.post(
      '/restaurants/me/customers-summary/:customerId/addresses',
      ...writeAccess,
      async (req: Request, res: Response) => {
        await this.ensureCustomerBelongsToRestaurant(req.params.customerId, req.restaurantId!);
        const input = parseBody(saveAddressSchema, req.body);
        const address = await this.addressRepository.create(req.params.customerId, input);
        res.json(201, address);
      },
    );

    // Pedido explícito do usuário — alterar um endereço já cadastrado do cliente, pela retaguarda.
    application.put(
      '/restaurants/me/customers-summary/:customerId/addresses/:addressId',
      ...writeAccess,
      async (req: Request, res: Response) => {
        await this.ensureCustomerBelongsToRestaurant(req.params.customerId, req.restaurantId!);
        await this.findCustomerAddress(req.params.addressId, req.params.customerId);
        const input = parseBody(saveAddressSchema, req.body);
        const address = await this.addressRepository.update(req.params.addressId, input);
        res.json(200, address);
      },
    );

    // specs/0131-cashback-app REQ-8 / specs/0132-programa-fidelidade-app REQ-6 — saldo +
    // histórico + progresso de fidelidade do cliente neste restaurante. Mesma checagem de posse
    // da rota de endereços acima (nunca por `customerId` adivinhado).
    application.get(
      '/restaurants/me/customers-summary/:customerId/balance',
      ...authenticated,
      async (req: Request, res: Response) => {
        const orders = await this.orderRepository.findManyByCustomerAndRestaurant(req.params.customerId, req.restaurantId!);
        if (orders.length === 0) {
          res.json(200, { balance: 0, loyaltyStampCount: 0, transactions: [] });
          return;
        }
        const [balance, transactions] = await Promise.all([
          this.customerBalanceService.getOrCreate(req.params.customerId, req.restaurantId!),
          this.customerBalanceService.getHistory(req.params.customerId, req.restaurantId!),
        ]);
        res.json(200, { balance: balance.balance, loyaltyStampCount: balance.loyaltyStampCount, transactions });
      },
    );
  }

  /**
   * Pedido explícito do usuário — mesma checagem de posse já usada (inline) em "ver
   * endereços"/"ver saldo" acima, extraída aqui pra reusar nas rotas de escrita, mas mais
   * completa: cliente cadastrado manualmente (`createdByRestaurantId`) e ainda sem nenhum pedido
   * também pode ser editado — as rotas de leitura acima não cobrem esse caso (só checam
   * `findManyByCustomerAndRestaurant`), comportamento pré-existente não alterado aqui.
   */
  private async ensureCustomerBelongsToRestaurant(customerId: string, restaurantId: string): Promise<ICustomer> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundError('Cliente não encontrado');
    if (customer.createdByRestaurantId === restaurantId) return customer;
    const orders = await this.orderRepository.findManyByCustomerAndRestaurant(customerId, restaurantId);
    if (orders.length === 0) throw new NotFoundError('Cliente não encontrado');
    return customer;
  }

  private async findCustomerAddress(addressId: string, customerId: string): Promise<IAddress> {
    const address = await this.addressRepository.findById(addressId);
    if (!address || address.customerId !== customerId) {
      throw new NotFoundError('Endereço não encontrado');
    }
    return address;
  }
}
