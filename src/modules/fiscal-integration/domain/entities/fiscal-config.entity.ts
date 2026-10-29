export type FiscalEnvironment = 'homologacao' | 'producao';

/** specs/0091-integracao-fiscal-focusnfe — NFCe é o único documento implementado nesta v1 (ver
 * `docs/FOCUSNFE.md`); `cfe`/`nfe` existem no tipo pra o cadastro já aceitar a escolha (depende
 * do regime tributário/estado de cada restaurante, não é decisão do software), mas emitir com
 * eles lança erro explícito até ganharem implementação própria. */
export type FiscalDocumentType = 'nfce' | 'cfe' | 'nfe';

/**
 * specs/0091-integracao-fiscal-focusnfe — configuração fiscal de UM restaurante (coleção
 * própria, `plan.md` — diferente do padrão do iFood, que guarda credenciais direto em
 * `Restaurant`). `focusNfeToken`/`webhookToken` nunca devem voltar numa resposta de API (mesmo
 * cuidado de `asaasApiKey`/`ifoodClientSecret`).
 */
export interface IFiscalConfig {
  restaurantId: string;
  focusNfeToken: string;
  environment: FiscalEnvironment;
  documentType: FiscalDocumentType;
  /**
   * Risco real (`plan.md`, "Riscos e alternativas consideradas"): emissão fiscal errada é
   * problema tributário de verdade, não só um bug. Mesmo com `environment === 'producao'`
   * configurado, a emissão automática (`FiscalEmissionService.emitForOrder`) só dispara se este
   * campo for `true` — um "botão de ativar produção" separado da configuração inicial, que o
   * operador só liga depois de testar em homologação com sucesso. Em `environment ===
   * 'homologacao'` a emissão sempre é permitida (é o próprio ambiente de teste).
   */
  productionEnabled: boolean;
  /** specs/0091-integracao-fiscal-focusnfe REQ-3 — valor que o webhook `POST
   * /webhooks/focusnfe/:restaurantId` exige no header de autenticação (mesmo padrão de
   * `Restaurant.asaasWebhookToken`); gerado automaticamente na criação da config, nunca digitado
   * pelo operador. */
  webhookToken: string;
  /**
   * specs/0091-integracao-fiscal-focusnfe — CNPJ emitente, exigido pela FocusNFe
   * (`cnpj_emitente`) em toda emissão. Adição deliberada em relação ao `plan.md` original (que
   * não listava este campo): `Restaurant` não tem CNPJ cadastrado em lugar nenhum hoje (campo
   * inexistente na entidade) — sem ele a emissão nem monta o payload. Mantido aqui, dentro do
   * próprio módulo fiscal, em vez de virar um campo novo em `Restaurant`, por ser um dado usado
   * só por esta integração.
   */
  cnpj: string;
  createdAt: string;
  updatedAt: string;
}
