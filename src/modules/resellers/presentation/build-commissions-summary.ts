import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IResellerCommissionRepository } from '../domain/repositories/reseller-commission.repository.interface';

/**
 * specs/0205-comissao-revendedor REQ-12/REQ-13 — mesma forma de resposta usada pelo painel do
 * revendedor (`GET /reseller/me/commissions`) e pelo detalhe administrativo
 * (`GET /platform/resellers/:id/commissions`), só o `resellerId` muda.
 */
export async function buildCommissionsSummary(
  resellerId: string,
  commissionRepository: IResellerCommissionRepository,
  restaurantRepository: IRestaurantRepository,
) {
  const commissions = await commissionRepository.listByReseller(resellerId);
  const restaurants = await Promise.all(commissions.map((commission) => restaurantRepository.findById(commission.restaurantId)));

  const pendingCents = commissions.filter((c) => c.status === 'pendente').reduce((sum, c) => sum + c.commissionCents, 0);
  const paidCents = commissions.filter((c) => c.status === 'pago').reduce((sum, c) => sum + c.commissionCents, 0);

  return {
    commissions: commissions.map((commission, index) => ({
      id: commission.id,
      restaurantId: commission.restaurantId,
      restaurantName: restaurants[index]?.name ?? null,
      obligationKind: commission.obligationKind,
      obligationAmountCents: commission.obligationAmountCents,
      commissionCents: commission.commissionCents,
      status: commission.status,
      createdAt: commission.createdAt,
      paidAt: commission.paidAt ?? null,
      obligationRefundedAt: commission.obligationRefundedAt ?? null,
    })),
    pendingCents,
    paidCents,
  };
}
