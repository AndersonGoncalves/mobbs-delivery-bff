import type { ISubscriptionObligation } from './entities/subscription-obligation.entity';

/** Datas no fuso da operação (o vencimento/cobertura são meia-noite local de São Paulo). */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** `YYYY-MM` → `MM/YYYY`. */
function formatMonth(referenceMonth: string): string {
  const [year, month] = referenceMonth.split('-');
  return `${month}/${year}`;
}

/**
 * specs/0175 T059 — achado na homologação (28/11/2026, teste 7): a cobrança ia para o Asaas sem
 * descrição, e o restaurante via só "R$ 100,00" na fatura/Pix, sem saber do que se tratava. A
 * descrição aparece na fatura do Asaas e no comprovante do Pix.
 */
export function obligationChargeDescription(obligation: ISubscriptionObligation): string {
  const prefix = 'BsDelivery — ';
  switch (obligation.kind) {
    case 'monthly':
      return `${prefix}mensalidade${obligation.referenceMonth ? ` de ${formatMonth(obligation.referenceMonth)}` : ''}`;
    case 'monthly-prorated':
      return `${prefix}mensalidade proporcional${obligation.referenceMonth ? ` de ${formatMonth(obligation.referenceMonth)}` : ''}`;
    case 'annual-initial':
    case 'annual-renewal': {
      const label = obligation.kind === 'annual-initial' ? 'assinatura anual' : 'renovação da assinatura anual';
      const period = obligation.coveragePeriod
        ? ` (${formatDate(obligation.coveragePeriod.start)} a ${formatDate(obligation.coveragePeriod.end)})`
        : '';
      return `${prefix}${label}${period}`;
    }
    case 'refund-difference':
      return `${prefix}diferença de estorno parcial da assinatura`;
  }
}
