import { buildCampaignMessage } from './build-campaign-message';

describe('buildCampaignMessage', () => {
  // AC-1 — sem placeholder nenhum, os dois links entram ao final, nessa ordem (cardápio depois
  // descadastro), igual ao exemplo dado pelo usuário.
  it('sem placeholders, acrescenta o link de cardápio e o de descadastro ao final', () => {
    const message = buildCampaignMessage({
      template: 'Boa noite !\nDesejamos um bom fim de semana.\nSegue link com nosso cardápio completo...',
      menuLink: 'https://bsdelivery.com.br/primepizza?src=wabot&campaign=95c46d5345',
      unsubscribeLink: 'https://bsdelivery.com.br/sair/dRngJ5WAOG',
    });

    expect(message).toBe(
      'Boa noite !\nDesejamos um bom fim de semana.\nSegue link com nosso cardápio completo...\n\n' +
        'https://bsdelivery.com.br/primepizza?src=wabot&campaign=95c46d5345\n\n' +
        'Para não receber mais promoções, por favor descadastre em: https://bsdelivery.com.br/sair/dRngJ5WAOG',
    );
  });

  // REQ-2 — com o placeholder no texto, o link entra exatamente ali, não repetido ao final.
  it('com {linkCardapio} no texto, substitui no lugar certo (não duplica ao final)', () => {
    const message = buildCampaignMessage({
      template: 'Confira: {linkCardapio}\n\nAproveite!',
      menuLink: 'https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123',
      unsubscribeLink: 'https://bsdelivery.com.br/sair/token-1',
    });

    expect(message).toContain('Confira: https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123\n\nAproveite!');
    expect(message.match(/bsdelivery\.com\.br\/primepizza/g)).toHaveLength(1);
  });

  // REQ-3 — mesma regra pro placeholder de descadastro, mas ele nunca pode sumir da mensagem
  // (exigência de produto, não só estética).
  it('com {linkDescadastro} no texto, substitui no lugar certo; sem ele, acrescenta ao final', () => {
    const withPlaceholder = buildCampaignMessage({
      template: 'Oi! Pra sair da lista: {linkDescadastro}',
      menuLink: 'https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123',
      unsubscribeLink: 'https://bsdelivery.com.br/sair/token-1',
    });
    expect(withPlaceholder).toBe(
      'Oi! Pra sair da lista: https://bsdelivery.com.br/sair/token-1\n\n' +
        'https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123',
    );

    const withoutPlaceholder = buildCampaignMessage({
      template: 'Oi!',
      menuLink: 'https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123',
      unsubscribeLink: 'https://bsdelivery.com.br/sair/token-1',
    });
    expect(withoutPlaceholder).toContain('https://bsdelivery.com.br/sair/token-1');
  });
});
