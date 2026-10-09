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

  // REQ-11 — envio avulso não tem nome associado.
  it('substitui por string vazia quando não há nome (envio avulso)', () => {
    const result = buildProspectOutreachMessage('Olá {nomeContato}!', '');
    expect(result).toBe('Olá !');
  });

  it('mensagem sem o placeholder fica inalterada', () => {
    const result = buildProspectOutreachMessage('Mensagem sem placeholder nenhum.', 'Ana');
    expect(result).toBe('Mensagem sem placeholder nenhum.');
  });
});
