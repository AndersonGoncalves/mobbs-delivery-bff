import * as nodemailer from 'nodemailer';

import { environment } from '../config/environment';
import { IEmailService, SendEmailInput } from './i-email-service';

/**
 * specs/0023-portabilidade-dados — implementação via `nodemailer` sobre SMTP genérico
 * (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, `environment.ts`), não um SDK de
 * provedor específico pago (ADR do `plan.md`): funciona com qualquer SMTP (inclusive Gmail em
 * dev) sem mudança de código, só de variável de ambiente.
 *
 * O transporte é criado sob demanda (getter, não campo resolvido no construtor) — mesmo motivo
 * de `AuthService` (Flutter) adiar `FirebaseAuth.instance`: sem `SMTP_HOST` configurado ainda
 * (deploy sem as credenciais, risco aceito no `plan.md`), instanciar `nodemailer.createTransport`
 * ansiosamente na composição do servidor (`main.ts`) não deveria derrubar o boot do BFF inteiro.
 */
export class NodemailerEmailService implements IEmailService {
  private transporterInstance: nodemailer.Transporter | undefined;

  private get transporter(): nodemailer.Transporter {
    if (!this.transporterInstance) {
      this.transporterInstance = nodemailer.createTransport({
        host: environment.email.smtpHost,
        port: environment.email.smtpPort,
        secure: environment.email.smtpPort === 465,
        auth: environment.email.smtpUser
          ? { user: environment.email.smtpUser, pass: environment.email.smtpPass }
          : undefined,
      });
    }
    return this.transporterInstance;
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: environment.email.smtpFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
  }
}
