import { addDaysCorridos, localMidnight } from '../billing-calendar';
import { obligationChargeDescription } from '../obligation-charge-description';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import type { IBillingPayerRepository } from '../repositories/billing-payer.repository.interface';
import type { IPixAvailabilityExceptionRepository } from '../repositories/pix-availability-exception.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

/** specs/0175 T054 — motivo legível pro painel: tempo esgotado ou a mensagem do próprio Asaas. */
function describeAsaasFailure(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'o Asaas não respondeu a tempo';
  const message = error instanceof Error ? error.message : String(error);
  const description = /"description":"([^"]+)"/.exec(message)?.[1];
  return description ? `o Asaas respondeu "${description}"` : message;
}

/** specs/0175 T043 — identificação da cobrança nos logs (sem dados do pagador). */
function describeObligation(obligation: ISubscriptionObligation): string {
  return `obrigação ${obligation.id} (${obligation.kind}, restaurante ${obligation.restaurantId}, R$ ${(obligation.amountCents / 100).toFixed(2)}, vence ${obligation.dueDate.toISOString().slice(0, 10)})`;
}

/** Só os 3 métodos de `AsaasClient` (`payments-asaas/infra/asaas-client.ts`) que a emissão
 * precisa — instanciado com a credencial da conta MÃE (`environment.asaas.apiKey`), nunca a
 * subconta de um restaurante (essa é a de `specs/0101`, pra receber pedidos, não pra pagar a
 * assinatura). */
export interface PlatformAsaasPixClient {
  createPixCharge(customerId: string, value: number, dueDate: string, externalReference: string, description?: string): Promise<{ id: string; status: string }>;
  getPixQrCode(chargeId: string): Promise<{ payload: string }>;
  listPaymentsByExternalReference(externalReference: string): Promise<{ id: string; status: string }[]>;
}

/** specs/0175 REQ-23 (opção C) — estados de cobrança do Asaas que nunca podem ser reaproveitados
 * na emissão (a fatura reaberta por "Cobrar de novo" precisa de uma cobrança NOVA). */
const NON_REUSABLE_ASAAS_STATUSES = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'DELETED']);

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
        console.warn(`[platform-billing] Pix não emitido: ${describeObligation(obligation)} — cadastro do pagador incompleto`);
        return;
      }

      // REQ-11 — busca ANTES de criar: cobre reinício no meio da emissão ou timeout pós-criação
      // (a obligation local ficou `awaiting_issue` sem `asaasChargeId` persistido, mas a cobrança
      // já existe de verdade no Asaas). REQ-23 (opção C) — nunca reaproveita a cobrança estornada
      // de uma fatura reaberta por "Cobrar de novo".
      const refundedChargeIds = new Set(obligation.refundedChargeIds ?? []);
      const existingPayment = (await this.deps.asaasClient.listPaymentsByExternalReference(obligation.id)).find(
        (payment) => !refundedChargeIds.has(payment.id) && !NON_REUSABLE_ASAAS_STATUSES.has(payment.status),
      );
      const chargeId = existingPayment ? existingPayment.id : (await this.deps.asaasClient.createPixCharge(
        payer.asaasCustomerId,
        obligation.amountCents / 100,
        obligation.dueDate.toISOString().slice(0, 10),
        obligation.id,
        obligationChargeDescription(obligation),
      )).id;

      // specs/0175 T054 (achado na homologação, 28/11/2026) — a cobrança já existe no Asaas: guarda o id
      // ANTES do QR, pra ele aparecer no painel e o webhook/estorno acharem a cobrança mesmo se o QR falhar.
      if (obligation.asaasChargeId !== chargeId) await this.deps.obligationRepository.recordAsaasCharge(obligation.id, chargeId);

      let qrCode: { payload: string };
      try {
        qrCode = await this.deps.asaasClient.getPixQrCode(chargeId);
      } catch (error) {
        throw new Error(`Cobrança ${chargeId} criada no Asaas, mas o QR do Pix não foi gerado: ${describeAsaasFailure(error)}`);
      }
      await this.deps.obligationRepository.markIssued(obligation.id, { asaasChargeId: chargeId, pixPayload: qrCode.payload }, now);
      console.log(`[platform-billing] Pix emitido: ${describeObligation(obligation)} — cobrança Asaas ${chargeId}${existingPayment ? ' (já existia, reaproveitada)' : ''}`);

      // REQ-10 (decisão 10)/AC-5 — só cria a exceção quando o Pix válido só ficou disponível
      // DEPOIS do vencimento comercial, por falha reconhecidamente da plataforma (nunca por
      // cadastro incompleto do pagador — esse caso já retornou mais acima, antes de chegar aqui).
      const startOfDayAfterDueDate = new Date(localMidnight(obligation.dueDate).getTime() + DAY_MS);
      if (now.getTime() >= startOfDayAfterDueDate.getTime()) {
        await this.deps.pixAvailabilityExceptionRepository.createIfAbsent(obligation.id, now, addDaysCorridos(now, 3));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro desconhecido na emissão';
      // specs/0175 T043 — antes o motivo ia só para o banco (`issue_failed`), sem log: falha de
      // emissão (Asaas fora, chave inválida, QR ainda não gerado) era invisível na operação. O
      // ciclo tenta de novo a cada 5 minutos.
      console.error(`[platform-billing] falha ao emitir o Pix: ${describeObligation(obligation)} — ${reason} (nova tentativa no próximo ciclo)`);
      await this.deps.obligationRepository.markIssueFailed(obligation.id, reason, now);
    }
  }
}
