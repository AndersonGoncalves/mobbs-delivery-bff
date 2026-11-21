import { buildProspectOutreachMessage } from './build-prospect-outreach-message';

describe('buildProspectOutreachMessage (specs/0124-campanha-whatsapp-prospects REQ-3.1)', () => {
  it('substitui {nomeContato} pelo nome informado', () => {
    const result = buildProspectOutreachMessage('Olá! Vi o {nomeContato} por aqui.', 'Pizzaria do João');
    expect(result).toBe('Olá! Vi o Pizzaria do João por aqui.');
  });

  it('substitui todas as ocorrências do placeholder', () => {
    const result = buildProspectOutreachMessage('{nomeContato}, tudo bem? {nomeContato}!', 'Ana');
    expect(result).toBe('Ana, tudo bem? Ana!');
  });

  // REQ-11 — envio avulso não tem nome associado. Achado (20/11/2026): sem nome, remove a
  // sentença inteira (não só o placeholder), pra não deixar frase quebrada no envio.
  it('remove a sentença inteira do placeholder quando não há nome (envio avulso)', () => {
    const result = buildProspectOutreachMessage('Olá {nomeContato}!', '');
    expect(result).toBe('');
  });

  it('remove só a sentença do placeholder, preservando o resto da mensagem (sem nome)', () => {
    const result = buildProspectOutreachMessage(
      'Olá! 👋\nVi o {nomeContato} por aqui. Você já parou pra calcular quanto paga de comissão nos apps de entrega por mês?',
      '',
    );
    expect(result).toBe(
      'Olá! 👋\nVocê já parou pra calcular quanto paga de comissão nos apps de entrega por mês?',
    );
  });

  it('mensagem sem o placeholder fica inalterada', () => {
    const result = buildProspectOutreachMessage('Mensagem sem placeholder nenhum.', 'Ana');
    expect(result).toBe('Mensagem sem placeholder nenhum.');
  });
});
