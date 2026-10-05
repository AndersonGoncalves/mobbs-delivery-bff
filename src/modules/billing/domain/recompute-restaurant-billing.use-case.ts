import type { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';
import type { IOrder } from '../../orders/domain/entities/order.entity';
import {
  WARNING_AT_CENTS,
  buildUpgradeMessage,
  buildWarningMessage,
  computeBillingTier,
  defaultBilling,
  monthKeyOf,
  monthRange,
  sumRevenueCents,
  tierRank,
} from './billing';

export interface RecomputeBillingRestaurantRepository {
  findById(id: string): Promise<IRestaurant | null>;
  updateBilling(id: string, billing: IRestaurantBilling): Promise<IRestaurant>;
}

export interface RecomputeBillingOrderRepository {
  findDeliveredByRestaurantBetween(restaurantId: string, start: Date, end: Date): Promise<IOrder[]>;
}

/** Envia uma mensagem ao próprio restaurante. Nunca lança: falha de WhatsApp não quebra o pedido. */
export interface IBillingNotifier {
  notifyRestaurant(restaurant: IRestaurant, text: string): Promise<void>;
}

export interface RecomputeRestaurantBillingDeps {
  restaurantRepository: RecomputeBillingRestaurantRepository;
  orderRepository: RecomputeBillingOrderRepository;
  notifier: IBillingNotifier;
}

/**
 * specs/0042 REQ-1/REQ-2/REQ-3/REQ-4 — recalcula o faturamento do mês corrente de um restaurante a partir dos
 * pedidos entregues, atualiza a faixa e dispara o aviso de 75% e o comemorativo de subida, uma única vez por
 * mês. Os sinais de "já avisado" são zerados quando o mês de referência muda.
 */
export class RecomputeRestaurantBillingUseCase {
  constructor(private readonly deps: RecomputeRestaurantBillingDeps) {}

  async call(restaurantId: string, now: Date = new Date()): Promise<void> {
    const restaurant = await this.deps.restaurantRepository.findById(restaurantId);
    if (!restaurant) return;

    const month = monthKeyOf(now);
    const { start, end } = monthRange(month);
    const orders = await this.deps.orderRepository.findDeliveredByRestaurantBetween(restaurantId, start, end);
    const revenueCents = sumRevenueCents(orders);

    const current = restaurant.billing;
    const sameMonth = current?.referenceMonth === month;
    const previousTier = sameMonth && current ? current.currentTier : 'free';
    let notified75Percent = sameMonth && current ? current.notified75Percent : false;
    let notifiedTierUpgrade = sameMonth && current ? current.notifiedTierUpgrade : false;

    const tier = computeBillingTier(revenueCents);

    if (tier !== 'premium' && !notified75Percent && revenueCents >= WARNING_AT_CENTS[tier]) {
      await this.deps.notifier.notifyRestaurant(restaurant, buildWarningMessage(tier, revenueCents));
      notified75Percent = true;
    }

    if (tierRank(tier) > tierRank(previousTier) && !notifiedTierUpgrade) {
      await this.deps.notifier.notifyRestaurant(restaurant, buildUpgradeMessage(tier));
      notifiedTierUpgrade = true;
    }

    const base = current ?? defaultBilling(month);
    await this.deps.restaurantRepository.updateBilling(restaurantId, {
      referenceMonth: month,
      currentTier: tier,
      notified75Percent,
      notifiedTierUpgrade,
      status: base.status,
      cycle: base.cycle,
    });
  }
}
