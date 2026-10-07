/**
 * specs/0092-campanha-whatsapp-clientes REQ-5 — descadastro de campanhas é por cliente +
 * restaurante (não por campanha, ver `plan.md` ADR): um único token continua válido pra sempre
 * descadastrar aquele cliente daquele restaurante, mesmo depois de várias campanhas.
 */
export interface ICampaignOptOutRepository {
  isOptedOut(restaurantId: string, customerId: string): Promise<boolean>;
  /** Cria o registro (sem `optedOutAt`) na primeira vez que esse cliente recebe uma campanha
   * desse restaurante; nas vezes seguintes devolve o token já existente. */
  getOrCreateToken(restaurantId: string, customerId: string): Promise<string>;
  /** `null` se o token não existir. Marcar `optedOutAt` é idempotente — acessar o link 2x não
   * lança nem duplica nada. */
  optOutByToken(token: string): Promise<{ restaurantId: string; customerId: string } | null>;
}
