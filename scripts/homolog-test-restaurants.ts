/**
 * specs/0215-ambiente-homologacao REQ-5 — dados fixos dos restaurantes de teste do ambiente de
 * homologação, usados por `seed-homolog-restaurants.ts`. Módulo puro (sem Mongo/Firebase), pra
 * poder ser testado e servir de fonte única da lista de logins documentada pro QA.
 *
 * Decisão do usuário (24/11/2026):
 * - 3 restaurantes fixos — `pizzaria`, `hamburgueria`, `pastelaria` (o slug `restaurante`, citado
 *   em versões anteriores da spec, foi descartado);
 * - 6 logins por restaurante, um por papel, no formato `<prefixo>_<slug>@bsdelivery.com.br`;
 * - senha única `123456` pra todas as contas (ambiente só de teste).
 *
 * O prefixo `caixa` corresponde ao papel `financeiro` — é o mesmo papel que a retaguarda exibe
 * como "Caixa" (`restaurant-settings/types.ts`, mobbs-delivery-web).
 */
import type { OperatorRole } from '../src/modules/restaurant-operators/domain/entities/restaurant-operator.entity';
import type { BusinessType } from '../src/modules/restaurants/domain/business-type';

export const HOMOLOG_EMAIL_DOMAIN = 'bsdelivery.com.br';
export const HOMOLOG_TEST_PASSWORD = '123456';

export interface HomologTestRestaurant {
  slug: string;
  name: string;
  businessType: BusinessType;
}

export const HOMOLOG_TEST_RESTAURANTS: readonly HomologTestRestaurant[] = [
  { slug: 'pizzaria', name: 'Pizzaria Teste', businessType: 'pizzaria' },
  { slug: 'hamburgueria', name: 'Hamburgueria Teste', businessType: 'hamburgueria' },
  { slug: 'pastelaria', name: 'Pastelaria Teste', businessType: 'pastelaria' },
];

interface HomologOperatorProfile {
  emailPrefix: string;
  role: OperatorRole;
  label: string;
}

/** Ordem = ordem de exibição no log do seed e na documentação do QA. */
export const HOMOLOG_OPERATOR_PROFILES: readonly HomologOperatorProfile[] = [
  { emailPrefix: 'dono', role: 'dono', label: 'Dono' },
  { emailPrefix: 'gerente', role: 'gerente', label: 'Gerente' },
  { emailPrefix: 'caixa', role: 'financeiro', label: 'Caixa' },
  { emailPrefix: 'garcom', role: 'garcom', label: 'Garçom' },
  { emailPrefix: 'motoboy', role: 'motoboy', label: 'Motoboy' },
  { emailPrefix: 'cozinha', role: 'cozinha', label: 'Cozinha' },
];

export interface HomologTestOperator {
  email: string;
  role: OperatorRole;
  name: string;
}

export function buildHomologOperators(restaurant: HomologTestRestaurant): HomologTestOperator[] {
  return HOMOLOG_OPERATOR_PROFILES.map(({ emailPrefix, role, label }) => ({
    email: `${emailPrefix}_${restaurant.slug}@${HOMOLOG_EMAIL_DOMAIN}`,
    role,
    name: `${label} ${restaurant.name}`,
  }));
}

/** Exige `--confirmar=homologacao` — trava contra rodar o seed, sem querer, com o `.env` de
 * produção (o seed cria restaurantes e contas com senha fraca de propósito). */
export function isHomologConfirmed(args: Record<string, string>): boolean {
  return args.confirmar === 'homologacao';
}
