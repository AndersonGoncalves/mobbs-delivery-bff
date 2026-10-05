import type { Request } from 'restify';
import { ForbiddenError } from 'restify-errors';

/** specs/0106 REQ-1 — lista de e-mails da administração da plataforma, vinda de `PLATFORM_ADMIN_EMAILS`. */
export function parsePlatformAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * specs/0106 REQ-1/REQ-5 — só e-mails da lista acessam as rotas da plataforma. Encadeado depois de
 * `firebaseAuthMiddleware`. A mensagem é genérica: não revela nada sobre restaurantes.
 */
export function buildPlatformAdminMiddleware(allowedEmails: string[]) {
  return async function platformAdminMiddleware(req: Request): Promise<void> {
    const email = req.user?.email?.toLowerCase();
    if (!email || !allowedEmails.includes(email)) {
      throw new ForbiddenError('Acesso restrito à administração da plataforma');
    }
  };
}
