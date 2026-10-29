/**
 * specs/0121-integracao-uber-entregas — configuração da integração Uber Direct de UM restaurante
 * (coleção própria, `plan.md` — mesmo padrão de `FiscalConfig`/specs/0091, diferente do iFood, que
 * guarda credenciais direto em `Restaurant`). `clientSecret`/`webhookToken` nunca devem voltar
 * numa resposta de API (mesmo cuidado de `focusNfeToken`/`ifoodClientSecret`).
 */
export interface IUberDeliveryConfig {
  restaurantId: string;
  /** "Uber ID de cliente do desenvolvedor" (REQ-1) — `customer_id` da Uber Direct, usado no path
   * de toda chamada (`/v1/customers/{customerId}/...`). */
  customerId: string;
  /** "ID do usuário" (REQ-1, nome da referência visual) — mapeado pro `client_id` do OAuth2
   * client_credentials (suposição documentada, `docs/UBER-DIRECT.md`: sem ele não dá pra obter
   * token de acesso nenhum, e a doc pública não usa esse nome exato pra nenhum campo real). */
  clientId: string;
  clientSecret: string;
  /** CEP de origem do negócio (ponto de partida da coleta, REQ-1) — pode ser diferente do
   * `Restaurant.address.zipCode` já cadastrado (ex. cozinha/central de produção != endereço
   * principal exibido pro cliente). */
  originZipCode: string;
  /** specs/0121 REQ-3 — valor exigido no webhook (`POST /webhooks/uber-direct/:restaurantId`,
   * query param `token`, ver `plan.md` "Limitações conhecidas" #1); gerado automaticamente na
   * criação da config, nunca digitado pelo operador. */
  webhookToken: string;
  createdAt: string;
  updatedAt: string;
}
