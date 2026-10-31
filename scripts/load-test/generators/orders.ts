import { randomUUID } from 'crypto';
import { OrderModel } from '../../../src/modules/orders/infra/models/order.mongoose.model';
import { OrderCounterModel } from '../../../src/modules/orders/infra/models/order-counter.mongoose.model';
import { PaymentModel } from '../../../src/modules/orders/infra/models/payment.mongoose.model';
import { Prng } from '../prng';
import { LOAD_TEST_CONFIG, BATCH_SIZE } from '../config';
import { GeneratedRestaurant } from './restaurants';
import { PAYMENT_METHODS, ORDER_TYPES } from '../fixtures';

// Pedidos históricos: a grande maioria já foi entregue (ano inteiro já passou), uma fração
// pequena cancelada, residual "em aberto" pra não deixar 100% dos dados num estado terminal.
const STATUS_WEIGHTS = [
  { weight: 0.9, value: 'entregue' },
  { weight: 0.07, value: 'cancelado' },
  { weight: 0.03, value: 'confirmado' },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function generateOrders(
  rng: Prng,
  restaurants: GeneratedRestaurant[],
  customerIds: string[],
  onProgress: (done: number, total: number, ordersSoFar: number) => void,
): Promise<number> {
  const days = LOAD_TEST_CONFIG.orders.days;
  const now = Date.now();

  // Insert cru via o driver nativo (bypassa validação/hooks/timestamps do Mongoose) — é a
  // coleção que mais pesa (~2,5 milhões de docs), então aqui a velocidade importa mais que a
  // conveniência de deixar o Mongoose aplicar defaults; por isso todo campo abaixo é setado
  // manualmente (ver `docs/architecture/...` — nenhum default do schema é aplicado neste caminho).
  const orderCollection = OrderModel.collection;
  const paymentCollection = PaymentModel.collection;

  let orderBatch: Record<string, unknown>[] = [];
  let paymentBatch: Record<string, unknown>[] = [];
  const finalSeqByRestaurant = new Map<string, number>();
  let ordersSoFar = 0;

  const flush = async () => {
    if (orderBatch.length > 0) {
      await orderCollection.insertMany(orderBatch, { ordered: false });
      orderBatch = [];
    }
    if (paymentBatch.length > 0) {
      await paymentCollection.insertMany(paymentBatch, { ordered: false });
      paymentBatch = [];
    }
  };

  for (let r = 0; r < restaurants.length; r++) {
    const restaurant = restaurants[r];
    if (restaurant.products.length === 0) {
      onProgress(r + 1, restaurants.length, ordersSoFar);
      continue;
    }

    let seq = 0;
    for (let day = days - 1; day >= 0; day--) {
      const ordersToday = rng.int(restaurant.ordersPerDayMin, restaurant.ordersPerDayMax);
      for (let o = 0; o < ordersToday; o++) {
        seq++;
        const orderId = randomUUID();
        const createdAt = new Date(now - day * DAY_MS - rng.int(0, DAY_MS - 1));

        const itemCount = rng.int(1, Math.min(6, restaurant.products.length));
        const items: Record<string, unknown>[] = [];
        let subtotal = 0;
        for (let it = 0; it < itemCount; it++) {
          const product = rng.pick(restaurant.products);
          const quantity = rng.int(1, 3);
          subtotal += product.price * quantity;
          items.push({
            id: randomUUID(),
            productId: product.id,
            productName: product.name,
            quantity,
            selections: [],
            unitPrice: product.price,
          });
        }
        subtotal = Math.round(subtotal * 100) / 100;

        const orderType = rng.pick(ORDER_TYPES);
        const deliveryFee = orderType === 'delivery' ? rng.pick([0, 5, 7.9, 9.9, 12]) : 0;
        const discount = rng.bool(0.1) ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
        const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;
        const status = rng.weighted(STATUS_WEIGHTS);
        const paymentMethod = rng.pick(PAYMENT_METHODS);
        const customerId = customerIds[rng.int(0, customerIds.length - 1)];

        orderBatch.push({
          _id: orderId,
          orderNumber: seq,
          trackingToken: `lt-${restaurant.id.slice(0, 8)}-${seq}-${rng.hex(8)}`,
          customerId,
          restaurantId: restaurant.id,
          items,
          orderType,
          status,
          statusHistory: [],
          subtotal,
          deliveryFee,
          discount,
          total,
          paymentMethod,
          createdAt,
        });

        paymentBatch.push({
          _id: randomUUID(),
          orderId,
          method: paymentMethod,
          status: status === 'cancelado' ? 'estornado' : 'aprovado',
          amount: total,
          createdAt,
        });

        ordersSoFar++;
        if (orderBatch.length >= BATCH_SIZE) await flush();
      }
    }
    finalSeqByRestaurant.set(restaurant.id, seq);
    onProgress(r + 1, restaurants.length, ordersSoFar);
  }

  await flush();

  const counterDocs = [...finalSeqByRestaurant.entries()].map(([restaurantId, seq]) => ({ _id: restaurantId, seq }));
  if (counterDocs.length > 0) await OrderCounterModel.collection.insertMany(counterDocs, { ordered: false });

  return ordersSoFar;
}
