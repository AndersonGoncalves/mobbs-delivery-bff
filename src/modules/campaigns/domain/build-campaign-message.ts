/**
 * specs/0092-campanha-whatsapp-clientes REQ-2/REQ-3 — placeholders em português camelCase, mesma
 * convenção de `notifications/domain/message-placeholders.ts` (`numeroPedido`, `nomeCliente`
 * etc.), mas independente dela (essa é sobre `IOrder`; esta é sobre o texto livre que o operador
 * escreve na campanha).
 */
const MENU_LINK_PLACEHOLDER = '{linkCardapio}';
const UNSUBSCRIBE_LINK_PLACEHOLDER = '{linkDescadastro}';

export interface BuildCampaignMessageInput {
  /** Texto livre que o operador escreveu na retaguarda. */
  template: string;
  menuLink: string;
  unsubscribeLink: string;
}

/**
 * REQ-2 — se o operador escreveu `{linkCardapio}` no texto, o link de cardápio entra exatamente
 * ali; senão, entra numa linha própria ao final.
 *
 * REQ-3 — mesma regra pro `{linkDescadastro}`, mas com uma garantia a mais: o link de
 * descadastro **sempre** aparece na mensagem final, nunca depende do operador lembrar de incluir
 * o placeholder (exigência legal/de produto, não só estética).
 */
export function buildCampaignMessage({ template, menuLink, unsubscribeLink }: BuildCampaignMessageInput): string {
  const hasMenuPlaceholder = template.includes(MENU_LINK_PLACEHOLDER);
  const hasUnsubscribePlaceholder = template.includes(UNSUBSCRIBE_LINK_PLACEHOLDER);

  let message = template;
  if (hasMenuPlaceholder) message = message.split(MENU_LINK_PLACEHOLDER).join(menuLink);
  if (hasUnsubscribePlaceholder) message = message.split(UNSUBSCRIBE_LINK_PLACEHOLDER).join(unsubscribeLink);

  if (!hasMenuPlaceholder) message = `${message.trim()}\n\n${menuLink}`;
  if (!hasUnsubscribePlaceholder) {
    message = `${message.trim()}\n\nPara não receber mais promoções, por favor descadastre em: ${unsubscribeLink}`;
  }

  return message;
}
