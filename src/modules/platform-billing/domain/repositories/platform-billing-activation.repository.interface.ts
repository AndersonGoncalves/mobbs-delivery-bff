/**
 * specs/0175-cobranca-assinatura-asaas REQ-34 — piso de competência: lojas existentes (e novas)
 * só são cobradas a partir do mês de ativação desta integração, nunca retroativo.
 */
export interface IPlatformBillingActivationRepository {
  get(): Promise<{ activatedMonth: string } | null>;
  /** Cria só se ainda não existir — deploys seguintes nunca pisam em cima (migração idempotente). */
  createIfAbsent(activatedMonth: string): Promise<{ activatedMonth: string }>;
}
