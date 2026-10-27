import type { IPixAvailabilityException } from '../entities/pix-availability-exception.entity';

export interface IPixAvailabilityExceptionRepository {
  findByObligationId(obligationId: string): Promise<IPixAvailabilityException | null>;
  /** Upsert `$setOnInsert` — cria só se não existir ainda; se já existe, devolve o existente SEM
   * alterar `firstValidPixAvailableAt`/`graceDeadline` (AC-5 "reprocessar não renova a janela"). */
  createIfAbsent(obligationId: string, firstValidPixAvailableAt: Date, graceDeadline: Date): Promise<IPixAvailabilityException>;
}
