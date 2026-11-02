import type { PipelineStage } from 'mongoose';

import { OrderModel } from '../../../orders/infra/models/order.mongoose.model';
import { CustomerModel } from '../../../customers/infra/models/customer.mongoose.model';
import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
import { ICustomerSummary } from '../../domain/entities/customer-summary.entity';
import { ICustomerSummaryRepository } from '../../domain/repositories/customer-summary.repository.interface';

interface CustomerSummaryAggregationResult {
  _id: string; // customerId
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date;
  customer: { name: string; phone?: string; allowedPaymentMethods?: PaymentMethod[] };
}

interface StandaloneCustomerDocument {
  _id: string;
  name: string;
  phone?: string;
  allowedPaymentMethods?: PaymentMethod[];
}

interface CustomerSummaryPageItem {
  customerId: string;
  name: string;
  phone?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  allowedPaymentMethods?: PaymentMethod[];
}

interface CustomerSummaryFacetResult {
  items: CustomerSummaryPageItem[];
  totalCount: Array<{ count: number }>;
}

// Escapa caracteres especiais de regex antes de usar `search` num `$regex` — sem isso, um cliente
// buscando por um telefone com parênteses/`+` (ex.: "(11) 99999-0000") quebraria o pipeline ou
// casaria de forma inesperada.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * specs/0016-clientes-retaguarda REQ-1/REQ-2/REQ-4 — agrega direto na coleção `order` (mesma
 * mecânica de `OrderMongooseRepository.getSalesSummary`, `docs/architecture/patterns.md` §16.6.1
 * "sem transações/agregação" não se aplica aqui: agregação de leitura, não transação), com
 * `$lookup` na coleção `customer` (`_id` = UID do Firebase, mesma chave de `Order.customerId`)
 * pra trazer `name`/`phone` num único round-trip ao banco.
 *
 * (achado real, pedido explícito do usuário) — união com clientes cadastrados manualmente pela
 * retaguarda (`createdByRestaurantId`, "NOVO" em Clientes) que ainda não fizeram pedido nenhum;
 * sem isso a lista continuaria 100% derivada de `order`, e um cliente recém-cadastrado nunca
 * apareceria até o primeiro pedido.
 */
export class CustomerSummaryMongooseRepository implements ICustomerSummaryRepository {
  async listByRestaurant(restaurantId: string, search?: string, fromDate?: Date, toDate?: Date): Promise<ICustomerSummary[]> {
    // Pedido explícito do usuário (follow-up) — `$match` continua sobre TODO o histórico (decide
    // quem aparece na lista); o período só entra como condição dentro do `$sum` condicional, pra
    // um cliente sem pedido no período ficar com os totais zerados em vez de sumir da lista.
    const isInPeriod =
      fromDate || toDate
        ? { $and: [{ $gte: ['$createdAt', fromDate ?? new Date(0)] }, { $lte: ['$createdAt', toDate ?? new Date('9999-12-31')] }] }
        : { $literal: true };

    const pipeline: PipelineStage[] = [
      { $match: { restaurantId } },
      {
        $group: {
          _id: '$customerId',
          totalOrders: { $sum: { $cond: [isInPeriod, 1, 0] } },
          totalSpent: { $sum: { $cond: [isInPeriod, '$total', 0] } },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
      { $lookup: { from: 'customer', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
    ];

    // REQ-2 — nome ou telefone, parcial, case-insensitive; roda no próprio Mongo (não no
    // cliente), mesmo espírito de `$match`/regex já usado no resto do BFF pra filtro escopado.
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({ $match: { $or: [{ 'customer.name': regex }, { 'customer.phone': regex }] } });
    }

    // REQ-4 — decrescente por padrão; reordenar por último pedido é feito na apresentação (web).
    pipeline.push({ $sort: { totalSpent: -1 } });

    const results = await OrderModel.aggregate<CustomerSummaryAggregationResult>(pipeline);

    const fromOrders = results.map((result) => ({
      customerId: result._id,
      name: result.customer.name,
      phone: result.customer.phone,
      totalOrders: result.totalOrders,
      totalSpent: result.totalSpent,
      lastOrderAt: result.lastOrderAt?.toISOString(),
      // specs/0171-meios-pagamento-por-cliente — `$lookup` acima já traz o documento completo do
      // `Customer` (sem `$project` próprio), então `allowedPaymentMethods` já está disponível aqui.
      allowedPaymentMethods: result.customer.allowedPaymentMethods,
    }));

    // (achado real, pedido explícito do usuário) — "NOVO" em Clientes cadastra um `Customer`
    // ANTES de qualquer pedido; sem isso, ele nunca apareceria aqui (lista inteira é derivada de
    // `order`). `createdByRestaurantId` escopa a visibilidade a só este restaurante — nunca
    // vaza um cadastro manual de outro restaurante. Um cliente já coberto por `fromOrders`
    // (já fez pedido aqui) não entra de novo com totais zerados.
    const alreadyListed = new Set(fromOrders.map((entry) => entry.customerId));
    const standaloneQuery: Record<string, unknown> = { createdByRestaurantId: restaurantId, _id: { $nin: [...alreadyListed] } };
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      standaloneQuery.$or = [{ name: regex }, { phone: regex }];
    }
    const standaloneCustomers = await CustomerModel.find(standaloneQuery).lean<StandaloneCustomerDocument[]>();
    const fromStandalone = standaloneCustomers.map((customer) => ({
      customerId: customer._id,
      name: customer.name,
      phone: customer.phone,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: undefined,
      allowedPaymentMethods: customer.allowedPaymentMethods,
    }));

    return [...fromOrders, ...fromStandalone].sort((a, b) => b.totalSpent - a.totalSpent);
  }

  // Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
  // histórico inteiro": método NOVO, separado de `listByRestaurant` acima de propósito (que
  // continua intacto, sem paginar). Combina as duas fontes (pedidos + cadastro manual) num só
  // pipeline via `$unionWith` — diferente de `listByRestaurant`, que busca as duas separado e
  // junta em memória — porque aqui o `$skip`/`$limit` precisa valer sobre o resultado JÁ
  // combinado e ordenado (senão a página 1 nunca veria um cliente cadastrado manualmente, que
  // só apareceria depois de paginar todos os clientes com pedido). O `$group` final por
  // `customerId` dedup a união sozinho (`$max` nos totais, `$first` no resto) — substitui o
  // `alreadyListed`/`$nin` de `listByRestaurant` sem precisar replicá-lo.
  async listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    search?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<{ items: ICustomerSummary[]; total: number }> {
    const isInPeriod =
      fromDate || toDate
        ? { $and: [{ $gte: ['$createdAt', fromDate ?? new Date(0)] }, { $lte: ['$createdAt', toDate ?? new Date('9999-12-31')] }] }
        : { $literal: true };

    const pipeline: PipelineStage[] = [
      { $match: { restaurantId } },
      {
        $group: {
          _id: '$customerId',
          totalOrders: { $sum: { $cond: [isInPeriod, 1, 0] } },
          totalSpent: { $sum: { $cond: [isInPeriod, '$total', 0] } },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
      { $lookup: { from: 'customer', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          name: '$customer.name',
          phone: '$customer.phone',
          totalOrders: 1,
          totalSpent: 1,
          lastOrderAt: 1,
          allowedPaymentMethods: '$customer.allowedPaymentMethods',
        },
      },
      {
        // (achado real, pedido explícito do usuário) — mesmo papel do `fromStandalone` de
        // `listByRestaurant`: cliente cadastrado manualmente ("NOVO" em Clientes) ANTES de
        // qualquer pedido. `totalOrders`/`totalSpent` zerados, `lastOrderAt` nulo.
        $unionWith: {
          coll: 'customer',
          pipeline: [
            { $match: { createdByRestaurantId: restaurantId } },
            {
              $project: {
                _id: 0,
                customerId: '$_id',
                name: 1,
                phone: 1,
                totalOrders: { $literal: 0 },
                totalSpent: { $literal: 0 },
                lastOrderAt: { $literal: null },
                allowedPaymentMethods: 1,
              },
            },
          ],
        },
      },
      {
        $group: {
          _id: '$customerId',
          name: { $first: '$name' },
          phone: { $first: '$phone' },
          totalOrders: { $max: '$totalOrders' },
          totalSpent: { $max: '$totalSpent' },
          lastOrderAt: { $max: '$lastOrderAt' },
          allowedPaymentMethods: { $first: '$allowedPaymentMethods' },
        },
      },
      // Achado real (02/11/2026) — o `$group` acima só deixa o valor de `customerId` disponível
      // como `_id` (convenção do Mongo); sem reprojetar de volta, `item.customerId` no map abaixo
      // vinha `undefined` pra TODA linha, e o DataGrid da retaguarda quebrava com o erro #85 ("A
      // row was provided without id") — `listByRestaurant` (sem paginação) não tem esse `$group`
      // final, por isso só o caminho paginado quebrava.
      { $project: { _id: 0, customerId: '$_id', name: 1, phone: 1, totalOrders: 1, totalSpent: 1, lastOrderAt: 1, allowedPaymentMethods: 1 } },
    ];

    // REQ-2 — nome ou telefone, parcial, case-insensitive; mesmo `$match` de `listByRestaurant`.
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({ $match: { $or: [{ name: regex }, { phone: regex }] } });
    }

    pipeline.push({ $sort: { totalSpent: -1 } });
    pipeline.push({
      $facet: {
        items: [{ $skip: pagination.skip }, { $limit: pagination.limit }],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await OrderModel.aggregate<CustomerSummaryFacetResult>(pipeline);

    const items = (result?.items ?? []).map((item) => ({
      customerId: item.customerId,
      name: item.name,
      phone: item.phone,
      totalOrders: item.totalOrders,
      totalSpent: item.totalSpent,
      lastOrderAt: item.lastOrderAt ? new Date(item.lastOrderAt).toISOString() : undefined,
      allowedPaymentMethods: item.allowedPaymentMethods,
    }));

    return { items, total: result?.totalCount[0]?.count ?? 0 };
  }
}
