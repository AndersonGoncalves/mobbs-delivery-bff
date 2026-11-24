import { OPERATOR_ROLES } from '../src/modules/restaurant-operators/domain/entities/restaurant-operator.entity';
import { BUSINESS_TYPES } from '../src/modules/restaurants/domain/business-type';
import {
  HOMOLOG_TEST_PASSWORD,
  HOMOLOG_TEST_RESTAURANTS,
  buildHomologOperators,
  findUnsafeExistingSlugs,
  isHomologConfirmed,
} from './homolog-test-restaurants';

describe('homolog-test-restaurants (specs/0215 REQ-5)', () => {
  it('tem exatamente os 3 restaurantes fixos — sem o slug "restaurante"', () => {
    expect(HOMOLOG_TEST_RESTAURANTS.map((restaurant) => restaurant.slug)).toEqual(['pizzaria', 'hamburgueria', 'pastelaria']);
  });

  it('cada restaurante usa um tipo de negócio válido (catálogo padrão existente)', () => {
    for (const restaurant of HOMOLOG_TEST_RESTAURANTS) {
      expect(BUSINESS_TYPES).toContain(restaurant.businessType);
    }
  });

  it('gera os 6 logins da pizzaria no formato <papel>_<slug>@bsdelivery.com.br', () => {
    const operators = buildHomologOperators(HOMOLOG_TEST_RESTAURANTS[0]);
    expect(operators.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'dono_pizzaria@bsdelivery.com.br', role: 'dono' },
      { email: 'gerente_pizzaria@bsdelivery.com.br', role: 'gerente' },
      { email: 'caixa_pizzaria@bsdelivery.com.br', role: 'financeiro' },
      { email: 'garcom_pizzaria@bsdelivery.com.br', role: 'garcom' },
      { email: 'motoboy_pizzaria@bsdelivery.com.br', role: 'motoboy' },
      { email: 'cozinha_pizzaria@bsdelivery.com.br', role: 'cozinha' },
    ]);
  });

  it('todo papel gerado existe no sistema e todo operador tem nome (aparece em Garçons/Motoboys)', () => {
    for (const restaurant of HOMOLOG_TEST_RESTAURANTS) {
      for (const operator of buildHomologOperators(restaurant)) {
        expect(OPERATOR_ROLES).toContain(operator.role);
        expect(operator.name.trim()).not.toBe('');
      }
    }
  });

  it('nenhum e-mail se repete entre restaurantes (só 1 vínculo ativo por e-mail)', () => {
    const emails = HOMOLOG_TEST_RESTAURANTS.flatMap((restaurant) => buildHomologOperators(restaurant).map((operator) => operator.email));
    expect(emails).toHaveLength(18);
    expect(new Set(emails).size).toBe(18);
  });

  it('senha única 123456 (decisão do usuário) — atende o mínimo de 6 caracteres do Firebase', () => {
    expect(HOMOLOG_TEST_PASSWORD).toBe('123456');
    expect(HOMOLOG_TEST_PASSWORD.length).toBeGreaterThanOrEqual(6);
  });

  it('só roda com --confirmar=homologacao explícito', () => {
    expect(isHomologConfirmed({ confirmar: 'homologacao' })).toBe(true);
    expect(isHomologConfirmed({})).toBe(false);
    expect(isHomologConfirmed({ confirmar: 'producao' })).toBe(false);
  });

  // specs/0215 T018 — trava contra vincular logins de teste a um restaurante real.
  it('recusa slug existente sem a marca do seed (ex.: restaurante real em produção)', () => {
    expect(findUnsafeExistingSlugs([{ slug: 'pizzaria' }])).toEqual(['pizzaria']);
    expect(findUnsafeExistingSlugs([{ slug: 'pizzaria', homologSeed: false }])).toEqual(['pizzaria']);
    expect(findUnsafeExistingSlugs([{ slug: 'pizzaria', homologSeed: 'true' }])).toEqual(['pizzaria']);
  });

  it('aceita slug criado pelo próprio seed e banco sem os slugs', () => {
    expect(findUnsafeExistingSlugs([{ slug: 'pizzaria', homologSeed: true }])).toEqual([]);
    expect(findUnsafeExistingSlugs([])).toEqual([]);
  });

  it('lista todos os slugs inseguros de uma vez (mistura de marcado e não marcado)', () => {
    expect(
      findUnsafeExistingSlugs([
        { slug: 'pizzaria', homologSeed: true },
        { slug: 'hamburgueria' },
        { slug: 'pastelaria' },
      ]),
    ).toEqual(['hamburgueria', 'pastelaria']);
  });
});
