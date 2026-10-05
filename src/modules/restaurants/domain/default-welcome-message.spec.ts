import { BUSINESS_TYPES } from './business-type';
import { buildDefaultWelcomeMessage } from './default-welcome-message';

describe('buildDefaultWelcomeMessage (specs/0094-mensagem-boas-vindas-home REQ-2)', () => {
  it('AC-2: usa o ramo do tipo de negócio escolhido no cadastro', () => {
    expect(buildDefaultWelcomeMessage('pizzaria')).toContain('à nossa pizzaria!');
    expect(buildDefaultWelcomeMessage('pastelaria')).toContain('à nossa pastelaria!');
  });

  it('AC-2: a mensagem padrão é a mesma para qualquer ramo, só muda o nome do ramo', () => {
    const pizzaria = buildDefaultWelcomeMessage('pizzaria');
    const lanches = buildDefaultWelcomeMessage('lanches_gerais');
    expect(pizzaria.replace('pizzaria', 'X')).toBe(lanches.replace('lanchonete', 'X'));
  });

  it('gera uma mensagem para todos os tipos, sem placeholder cru', () => {
    for (const type of BUSINESS_TYPES) {
      const message = buildDefaultWelcomeMessage(type);
      expect(message).toMatch(/^Seja bem-vindo\(a\) à nossa .+!/);
      expect(message.length).toBeLessThanOrEqual(500);
      expect(message).not.toContain('{');
    }
  });
});
