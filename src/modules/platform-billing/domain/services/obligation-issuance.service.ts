import { addDaysCorridos, localMidnight } from '../billing-calendar';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import type { IBillingPayerRepository } from '../repositories/billing-payer.repository.interface';
import type { IPixAvailabilityExceptionRepository } from '../repositories/pix-availability-exception.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Só os 3 métodos de `AsaasClient` (`payments-asaas/infra/asaas-client.ts`) que a emissão
 * precisa — instanciado com a credencial da conta MÃE (`environment.asaas.apiKey`), nunca a
 * subconta de um restaurante (essa é a de `specs/0101`, pra receber pedidos, não pra pagar a
 * assinatura). */
export interface PlatformAsaasPixClient {
  createPixCharge(customerId: string, value: number, dueDate: string, externalReference: string): Promise<{ id: string; status: string }>;
  getPixQrCode(chargeId: string): Promise<{ payload: string }>;
  findPaymentByExternalReference(externalReference: string): Promise<{ id: string } | null>;
}

/**
 * specs/0175-cobranca-assinatura-asaas REQ-9/REQ-11/REQ-12 — emite a cobrança Pix real no Asaas
 * pra cada obligation `awaiting_issue`/`issue_failed`, uma de cada vez, persistindo o resultado
 * antes de seguir pra próxima (nunca em lote all-or-nothing — reinício no meio continua do que
 * ainda está pendente, sem reprocessar as já emitidas).
 */
export class ObligationIssuanceService {
  constructor(
    private readonly deps: {
      obligationRepository: ISubscriptionObligationRepository;
      billingPayerRepository: IBillingPayerRepository;
      pixAvailabilityExceptionRepository: IPixAvailabilityExceptionRepository;
      asaasClient: PlatformAsaasPixClient;
    },
  ) {}

  /** Sem `restaurantId`: todas as obligations elegíveis (sweep global). Com `restaurantId`: só as
   * de um restaurante (reprocessamento administrativo, REQ-32). */
  async issuePending(now: Date, restaurantId?: string): Promise<void> {
    const eligible = await this.deps.obligationRepository.findEligibleForIssuance(restaurantId);
    for (const obligation of eligible) {
      await this.issueOne(obligation, now);
    }
  }

  private async issueOne(obligation: ISubscriptionObligation, now: Date): Promise<void> {
    try {
      const payer = await this.deps.billingPayerRepository.findByRestaurantId(obligation.restaurantId);
      if (!payer || !payer.completedAt) {
        await this.deps.obligationRepository.markIssueFailed(obligation.id, 'Cadastro do pagador incompleto — completar em "Planos e assinatura"', now);
        return;
      }

      // REQ-11 — busca ANTES de criar: cobre reinício no meio da emissão ou timeout pós-criação
      // (a obligation local ficou `awaiting_issue` sem `asaasChargeId` persistido, mas a cobrança
      // já existe de verdade no Asaas).
      const existingPayment = await this.deps.asaasClient.findPaymentByExternalReference(obligation.id);
      const chargeId = existingPayment ? existingPayment.id : (await this.deps.asaasClient.createPixCharge(
        payer.asaasCustomerId,
        obligation.amountCents / 100,
        obligation.dueDate.toISOString().slice(0, 10),
        obligation.id,
      )).id;

      const qrCode = await this.deps.asaasClient.getPixQrCode(chargeId);
      await this.deps.obligationRepository.markIssued(obligation.id, { asaasChargeId: chargeId, pixPayload: qrCode.payload }, now);

      // REQ-10 (decisão 10)/AC-5 — só cria a exceção quando o Pix válido só ficou disponível
      // DEPOIS do vencimento comercial, por falha reconhecidamente da plataforma (nunca por
      // cadastro incompleto do pagador — esse caso já retornou mais acima, antes de chegar aqui).
      const startOfDayAfterDueDate = new Date(localMidnight(obligation.dueDate).getTime() + DAY_MS);
      if (now.getTime() >= startOfDayAfterDueDate.getTime()) {
        await this.deps.pixAvailabilityExceptionRepository.createIfAbsent(obligation.id, now, addDaysCorridos(now, 3));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro desconhecido na emissão';
      await this.deps.obligationRepository.markIssueFailed(obligation.id, reason, now);
    }
  }
}
