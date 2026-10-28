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
}
