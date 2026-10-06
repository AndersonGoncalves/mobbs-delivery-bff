import { IReferral, ReferralStatus } from '../entities/referral.entity';

export interface IReferralRepository {
  create(input: { referrerCustomerId: string; referredRestaurantId: string; rewardCents: number }): Promise<IReferral>;
  /** Indicações de um cliente, da mais recente pra mais antiga (specs/0110 REQ-2). */
  findByReferrerCustomerId(customerId: string): Promise<IReferral[]>;
  /** Soma das recompensas ainda `pendente` do cliente (saldo a receber, specs/0110 REQ-6). */
  getPendingBalanceCents(customerId: string): Promise<number>;
  /** Todas as indicações de clientes, opcionalmente só de um status (painel da plataforma, REQ-8). */
  listAll(filter: { status?: ReferralStatus }): Promise<IReferral[]>;
  findById(id: string): Promise<IReferral | null>;
  /** Marca como `pago` sem mexer na data de quem já estava pago (REQ-7). */
  markPaid(id: string, paidAt: Date): Promise<IReferral | null>;
}
