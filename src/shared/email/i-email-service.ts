/**
 * specs/0023-portabilidade-dados — primeira capacidade de envio de e-mail do BFF. Mesma decisão
 * de escopo do `pino`/`IWhatsAppNotificationService` (`specs/0013`): capacidade real, mas só
 * usada aqui — não um "serviço geral" do sistema ainda.
 */
export interface EmailAttachment {
  filename: string;
  /** Conteúdo bruto do anexo (ex.: `JSON.stringify(...)` pro export de dados). */
  content: string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface IEmailService {
  send(input: SendEmailInput): Promise<void>;
}
