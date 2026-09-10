import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export const environment = {
  server: { port: Number(process.env.SERVER_PORT) || 3001 },
  db: { url: process.env.DB_URL || 'mongodb://localhost:27017/mobbs-delivery' },
  /** specs/0023-portabilidade-dados — SMTP genérico (qualquer provedor), sem SDK específico.
   * Sem essas variáveis configuradas, `NodemailerEmailService.send()` falha em runtime — REQ-5
   * garante que essa falha nunca trava o cliente (fire-and-forget, só logada). */
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
  },
};
