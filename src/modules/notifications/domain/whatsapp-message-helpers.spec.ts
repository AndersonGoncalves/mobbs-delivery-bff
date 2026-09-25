import { buildPaymentBlock, buildTrackingLink, renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

describe('renderTemplate (specs/0069)', () => {
  it('substitui as chaves conhecidas e mantém as desconhecidas literais', () => {
    expect(renderTemplate('Oi {nomeCliente}, {inexistente}', { nomeCliente: 'Ana' })).toBe('Oi Ana, {inexistente}');
  });

  it('omite a linha cujos placeholders ficaram todos vazios, mantendo as demais', () => {
    expect(renderTemplate('A\nDesconto: {desconto}\nB', { desconto: '' })).toBe('A\nB');
  });

  it('mantém a linha se ao menos um placeholder tem valor', () => {
    expect(renderTemplate('{a} e {b}', { a: '', b: 'x' })).toBe('e x');
  });

  it('um valor que contém "{...}" não é substituído de novo', () => {
    expect(renderTemplate('{nomeCliente} {total}', { nomeCliente: '{total}', total: 'R$ 1,00' })).toBe('{total} R$ 1,00');
  });

  it('colapsa 3+ quebras de linha seguidas em uma linha em branco', () => {
    expect(renderTemplate('A\n\n{x}\n\nB', { x: '' })).toBe('A\n\nB');
  });
});

describe('buildTrackingLink (specs/0069)', () => {
  it('monta <origem>/<slug>/track?token= (path, não subdomínio)', () => {
    expect(buildTrackingLink('meu-restaurante', 'tok123', 'https://bsdelivery.com.br')).toBe(
      'https://bsdelivery.com.br/meu-restaurante/track?token=tok123',
    );
  });

  it('ignora barra final na origem configurada', () => {
    expect(buildTrackingLink('r', 't', 'https://exemplo.com.br/')).toBe('https://exemplo.com.br/r/track?token=t');
  });

  it('usa https://bsdelivery.com.br quando PUBLIC_APP_BASE_URL não está definida', () => {
    expect(buildTrackingLink('r', 't')).toBe('https://bsdelivery.com.br/r/track?token=t');
  });
});

describe('buildPaymentBlock (specs/0069)', () => {
  it('Pix com copia-e-cola mostra o código e nenhuma chave crua', () => {
    const block = buildPaymentBlock({ order: { paymentMethod: 'pix', orderType: 'delivery' }, pixCode: 'CODIGO-PIX' });

    expect(block).toBe('*Pagamento*\nForma: Pix\nPix copia e cola:\nCODIGO-PIX');
  });

  it('specs/0073: com o código em mensagem separada, o bloco só avisa "na mensagem abaixo" e não repete o código', () => {
    const block = buildPaymentBlock({ order: { paymentMethod: 'pix', orderType: 'delivery' }, pixCode: 'CODIGO-PIX', pixCodeSentSeparately: true });

    expect(block).toBe('*Pagamento*\nForma: Pix\nPix copia e cola: na mensagem abaixo 👇');
    expect(block).not.toContain('CODIGO-PIX');
  });
});

describe('resolveTemplate (specs/0069)', () => {
  it('usa o padrão quando o template é undefined, vazio ou só espaços', () => {
    expect(resolveTemplate(undefined, 'padrão')).toBe('padrão');
    expect(resolveTemplate('', 'padrão')).toBe('padrão');
    expect(resolveTemplate('   \n ', 'padrão')).toBe('padrão');
  });

  it('usa o template configurado quando tem conteúdo', () => {
    expect(resolveTemplate('meu texto', 'padrão')).toBe('meu texto');
  });
});
