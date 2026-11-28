import { BusinessType } from './business-type';

// Com o artigo/preposição junto, porque o gênero muda ("à nossa pizzaria" × "ao nosso restaurante").
const RAMO_BY_BUSINESS_TYPE: Record<BusinessType, string> = {
  pizzaria: 'à nossa pizzaria',
  hamburgueria: 'à nossa hamburgueria',
  pastelaria: 'à nossa pastelaria',
  comida_japonesa: 'à nossa cozinha japonesa',
  acai_sorveteria: 'à nossa casa de açaí e sorvetes',
  lanches_gerais: 'à nossa lanchonete',
  marmitaria: 'à nossa marmitaria',
  restaurante: 'ao nosso restaurante',
};

/** specs/0094-mensagem-boas-vindas-home REQ-2 — texto inicial da mensagem de boas-vindas, nascido
 * no autocadastro a partir do tipo de negócio escolhido. Editável depois na retaguarda. */
export function buildDefaultWelcomeMessage(businessType: BusinessType): string {
  return `Olá, seja bem-vindo(a) ${RAMO_BY_BUSINESS_TYPE[businessType]}! Preparamos cada pedido com muito cuidado do primeiro ao último detalhe. Escolha seus favoritos, faça seu pedido e aproveite no conforto de casa. Obrigado pela preferência!`;
}
