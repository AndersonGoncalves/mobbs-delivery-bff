/** specs/0039-onboarding-primeiro-acesso REQ-8/ADR-0039-03 — tipos fixos nesta v1, sem tela de
 * administração; mais tipos exigem alteração de código (nova entrada aqui +
 * `default-catalogs-by-business-type.ts` + `default-welcome-message.ts`, e espelhado no web:
 * `shared/api/signup.ts` + `LandingPage.tsx`).
 *
 * Pedido explícito do usuário (10/11/2026) — "marmitaria" acrescentado, 7º tipo. */
export const BUSINESS_TYPES = [
  'pizzaria',
  'hamburgueria',
  'pastelaria',
  'comida_japonesa',
  'acai_sorveteria',
  'lanches_gerais',
  'marmitaria',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
