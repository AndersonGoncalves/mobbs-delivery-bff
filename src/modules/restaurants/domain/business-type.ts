/** specs/0039-onboarding-primeiro-acesso REQ-8/ADR-0039-03 — 6 tipos fixos nesta v1, sem tela de
 * administração; mais tipos exigem alteração de código (nova entrada aqui +
 * `default-catalogs-by-business-type.ts`). */
export const BUSINESS_TYPES = [
  'pizzaria',
  'hamburgueria',
  'pastelaria',
  'comida_japonesa',
  'acai_sorveteria',
  'lanches_gerais',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
