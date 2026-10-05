import { BusinessType } from './business-type';

const RAMO_BY_BUSINESS_TYPE: Record<BusinessType, string> = {
  pizzaria: 'pizzaria',
  hamburgueria: 'hamburgueria',
  pastelaria: 'pastelaria',
  comida_japonesa: 'cozinha japonesa',
  acai_sorveteria: 'casa de açaí e sorvetes',
  lanches_gerais: 'lanchonete',
};

/** specs/0094-mensagem-boas-vindas-home REQ-2 — texto inicial da mensagem de boas-vindas, nascido
 * no autocadastro a partir do tipo de negócio escolhido. Editável depois na retaguarda. */
export function buildDefaultWelcomeMessage(businessType: BusinessType): string {
  return `Olá! Seja bem-vindo(a) à nossa ${RAMO_BY_BUSINESS_TYPE[businessType]}! Aqui você encontra nossos produtos preparados com muito carinho e ingredientes selecionados. Esperamos que você se sinta em casa.`;
}
