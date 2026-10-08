import { OrderMongooseRepository } from '../../../orders/infra/repositories/order.mongoose.repository';
import { RestaurantModel } from '../../../restaurants/infra/models/restaurant.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';

// Mesmo teto usado antes desta spec como fallback pra restaurante sem `bestSellersCount`
// configurado (`CatalogController`, removido) — só um ponto de partida razoável, editável pelo
// operador imediatamente depois do deploy.
const BACKFILL_LIMIT = 10;

/**
 * specs/0117-vitrine-manual-e-ajustes-formularios REQ-3/REQ-5 — antes desta spec, "Mais pedidos"
 * era calculado por volume de pedidos (`orderRepository.getBestSellingProductIds`); agora é um
 * flag manual (`Product.isBestSeller`). Sem esta migração, todo restaurante com "Mostrar mais
 * pedidos" ligado perderia a seção no deploy (nenhum produto chega marcado `isBestSeller`) — ela
 * marca o ranking calculado ATUAL como ponto de partida, editável pelo operador depois.
 *
 * Roda no boot (mesmo padrão de `migrateOperatorRolesToDono`), idempotente por construção: só
 * toca produto cujo `isBestSeller` ainda não existe no documento (`$exists: false`) — uma vez
 * marcado (`true` ou `false`), nunca mais é sobrescrito por aqui, mesmo que o ranking calculado
 * mude depois (ele deixou de importar) ou que o servidor reinicie de novo. Isso garante que uma
 * curadoria manual feita pelo operador depois do primeiro boot NUNCA é desfeita por este
 * processo, só porque ele roda de novo no próximo restart.
 */
export async function backfillManualBestSellers(): Promise<void> {
  const orderRepository = new OrderMongooseRepository();
  const restaurants = await RestaurantModel.find({ showBestSellers: true }).select('_id').lean<{ _id: string }[]>();

  for (const restaurant of restaurants) {
    const bestSellingIds = await orderRepository.getBestSellingProductIds(restaurant._id, BACKFILL_LIMIT);

    await Promise.all(
      bestSellingIds.map((id, index) =>
        ProductModel.updateOne({ _id: id, isBestSeller: { $exists: false } }, { $set: { isBestSeller: true, bestSellerOrder: index } }),
      ),
    );
    // Resto dos produtos do restaurante (fora do ranking calculado) — marca `false` explícito,
    // pra nenhum ficar com o campo ausente (e esta checagem de `$exists` sempre encontrar
    // trabalho pendente em todo boot, mesmo sem nada pra fazer de verdade).
    await ProductModel.updateMany(
      { restaurantId: restaurant._id, isBestSeller: { $exists: false } },
      { $set: { isBestSeller: false, bestSellerOrder: 0 } },
    );
  }
}
