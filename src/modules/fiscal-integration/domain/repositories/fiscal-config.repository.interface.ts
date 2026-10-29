import { FiscalDocumentType, FiscalEnvironment, IFiscalConfig } from '../entities/fiscal-config.entity';

export interface SaveFiscalConfigInput {
  focusNfeToken: string;
  environment: FiscalEnvironment;
  documentType: FiscalDocumentType;
  cnpj: string;
}

export interface IFiscalConfigRepository {
  findByRestaurantId(restaurantId: string): Promise<IFiscalConfig | null>;

  /** REQ-1 — cria ou atualiza a config inteira (token/ambiente/documento/CNPJ); preserva
   * `webhookToken`/`productionEnabled` já existentes (gera um `webhookToken` novo só na
   * primeira vez; `productionEnabled` precisa do método dedicado abaixo, nunca muda aqui —
   * trocar o token/ambiente não deve reativar produção silenciosamente). */
  upsert(restaurantId: string, input: SaveFiscalConfigInput): Promise<IFiscalConfig>;

  /** "Botão de ativar produção" (`plan.md`) — mudança deliberada, separada da config geral. */
  setProductionEnabled(restaurantId: string, enabled: boolean): Promise<IFiscalConfig>;

  delete(restaurantId: string): Promise<void>;
}
