import { BUSINESS_TYPES } from './business-type';
import { buildDefaultWelcomeMessage } from './default-welcome-message';

describe('buildDefaultWelcomeMessage (specs/0094-mensagem-boas-vindas-home REQ-2)', () => {
  it('AC-2: usa o ramo do tipo de negócio escolhido no cadastro', () => {
    expect(buildDefaultWelcomeMessage('pizzaria')).toContain('à nossa pizzaria!');
    expect(buildDefaultWelcomeMessage('pastelaria')).toContain('à nossa pastelaria!');
  });

  it('gera uma mensagem para todos os tipos, sem placeholder cru', () => {
    for (const type of BUSINESS_TYPES) {
      const message = buildDefaultWelcomeMessage(type);
      expect(message).toMatch(/^Olá! Seja bem-vindo\(a\) à nossa .+!/);
      expect(message).not.toContain('{');
    }
  });
});
