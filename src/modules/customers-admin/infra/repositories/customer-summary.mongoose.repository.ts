import type { PipelineStage } from 'mongoose';

import { OrderModel } from '../../../orders/infra/models/order.mongoose.model';
import { ICustomerSummary } from '../../domain/entities/customer-summary.entity';
import { ICustomerSummaryRepository } from '../../domain/repositories/customer-summary.repository.interface';

interface CustomerSummaryAggregationResult {
  _id: string; // customerId
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date;
  customer: { name: string; phone?: string };
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
 */
export class CustomerSummaryMongooseRepository implements ICustomerSummaryRepository {
  async listByRestaurant(restaurantId: string, search?: string): Promise<ICustomerSummary[]> {
    const pipeline: PipelineStage[] = [
      { $match: { restaurantId } },
      {
        $group: {
          _id: '$customerId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total' },
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

    return results.map((result) => ({
      customerId: result._id,
      name: result.customer.name,
      phone: result.customer.phone,
      totalOrders: result.totalOrders,
      totalSpent: result.totalSpent,
      lastOrderAt: result.lastOrderAt?.toISOString(),
    }));
  }
}
