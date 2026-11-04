/**
 * specs/0201-controle-integracoes-cnpj-plataforma — switch global (não por restaurante, ver
 * ADR-1/ADR-2 do plan.md): determina se as integrações que exigem CNPJ da plataforma (Asaas
 * subconta, Mercado Pago, Cartão de Crédito Online) estão habilitadas. Um documento singleton
 * no Mongo, sem repository genérico — leitura/escrita direta desse único documento (a escrita é
 * um script pontual rodado pelo usuário, não um endpoint de API, ver ADR-2).
 */
export interface IPlatformConfigRepository {
  isCnpjIntegrationsEnabled(): Promise<boolean>;
}
