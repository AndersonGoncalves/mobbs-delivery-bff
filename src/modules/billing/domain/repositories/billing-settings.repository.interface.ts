import type { BillingSettings } from '../billing';

/**
 * specs/0113-parametrizacao-faixas-cobranca REQ-1 — documento único (sem histórico, ver plan.md
 * "Fora de escopo"): `get()` devolve `DEFAULT_BILLING_SETTINGS` quando nunca configurado,
 * `update()` sempre sobrescreve os 5 campos juntos (sem PATCH parcial — quem chama manda todos).
 */
export interface IBillingSettingsRepository {
  get(): Promise<BillingSettings>;
  update(settings: BillingSettings): Promise<BillingSettings>;
}
