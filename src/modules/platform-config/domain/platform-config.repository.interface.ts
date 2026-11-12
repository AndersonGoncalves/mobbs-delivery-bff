/**
 * specs/0209-desacoplar-integracoes-cnpj-plataforma — switches globais (não por restaurante, ver
 * ADR-1/ADR-2 do plan.md de specs/0201): cada integração que dependia do CNPJ da própria Mobbs
 * (Asaas subconta, Mercado Pago) ou era escondida pelo mesmo motivo de produto (iFood, 99Food)
 * agora tem seu próprio switch, independente dos demais. Um documento singleton no Mongo, sem
 * repository genérico — leitura/escrita direta desse único documento (a escrita é um script
 * pontual rodado pelo usuário, não um endpoint de API, ver ADR-2).
 *
 * (ajuste 10/11/2026, pedido explícito do usuário) — mesmo documento, 3 switches a mais: KDS,
 * Comanda e Autoatendimento (totem), cada um ligando/desligando o respectivo app na plataforma
 * inteira. Mesma escrita por script pontual (`scripts/set-platform-config.ts`), nunca endpoint.
 *
 * (ajuste 11/11/2026, pedido explícito do usuário) — mais um switch, mesma mecânica: Automação
 * Instagram.
 */
export interface IPlatformConfigRepository {
  isAsaasIntegrationEnabled(): Promise<boolean>;
  isMercadoPagoIntegrationEnabled(): Promise<boolean>;
  isIfoodIntegrationEnabled(): Promise<boolean>;
  isNinetyNineFoodIntegrationEnabled(): Promise<boolean>;
  isKdsAppEnabled(): Promise<boolean>;
  isComandaAppEnabled(): Promise<boolean>;
  isTotemAppEnabled(): Promise<boolean>;
  isInstagramAutomationEnabled(): Promise<boolean>;
  /** (ajuste 11/11/2026, pedido explícito do usuário) — booleano + carimbo de ativação de cada
   * switch, de uma vez só; usado só por `PlatformConfigController` pra calcular a tag "Novo" (10
   * dias desde a ativação) — os demais consumidores (totem/orders/asaas/mercadopago) continuam
   * usando só os `isXEnabled()` acima, sem precisar da data. */
  getSnapshot(): Promise<PlatformConfigSnapshot>;
}

export interface PlatformConfigSnapshot {
  asaasIntegrationEnabled: boolean;
  asaasIntegrationEnabledAt?: Date;
  mercadoPagoIntegrationEnabled: boolean;
  mercadoPagoIntegrationEnabledAt?: Date;
  ifoodIntegrationEnabled: boolean;
  ifoodIntegrationEnabledAt?: Date;
  ninetyNineFoodIntegrationEnabled: boolean;
  ninetyNineFoodIntegrationEnabledAt?: Date;
  kdsAppEnabled: boolean;
  kdsAppEnabledAt?: Date;
  comandaAppEnabled: boolean;
  comandaAppEnabledAt?: Date;
  totemAppEnabled: boolean;
  totemAppEnabledAt?: Date;
  instagramAutomationEnabled: boolean;
  instagramAutomationEnabledAt?: Date;
}
