import type { IPixAvailabilityException } from '../entities/pix-availability-exception.entity';

export interface IPixAvailabilityExceptionRepository {
  findByObligationId(obligationId: string): Promise<IPixAvailabilityException | null>;
  /** Upsert `$setOnInsert` — cria só se não existir ainda; se já existe, devolve o existente SEM
   * alterar `firstValidPixAvailableAt`/`graceDeadline` (AC-5 "reprocessar não renova a janela"). */
  createIfAbsent(obligationId: string, firstValidPixAvailableAt: Date, graceDeadline: Date): Promise<IPixAvailabilityException>;

  /** specs/0175-cobranca-assinatura-asaas REQ-32 — exceção administrativa EXPLÍCITA (sempre
   * sobrescreve, diferente de `createIfAbsent`): o admin está deliberadamente estendendo/criando
   * o prazo, não reprocessando automaticamente — nunca deveria ficar sem efeito só porque já
   * existia uma exceção automática anterior. Quem chama (`PlatformController`) grava o
   * `ISubscriptionEvent` de auditoria (motivo/autoria) separadamente. */
  setAdminOverride(obligationId: string, graceDeadline: Date, now: Date): Promise<IPixAvailabilityException>;
}
