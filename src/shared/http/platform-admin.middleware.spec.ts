import { buildPlatformAdminMiddleware, parsePlatformAdminEmails } from './platform-admin.middleware';

function requestWithEmail(email?: string) {
  return { user: email ? { email } : undefined } as unknown as Parameters<ReturnType<typeof buildPlatformAdminMiddleware>>[0];
}

describe('platformAdminMiddleware (specs/0106 REQ-1/REQ-5)', () => {
  const middleware = buildPlatformAdminMiddleware(parsePlatformAdminEmails('admin@mobbs.com.br, dono@mobbs.com.br'));

  it('AC-1: e-mail da lista passa, sem diferença de maiúsculas', async () => {
    await expect(middleware(requestWithEmail('ADMIN@mobbs.com.br'))).resolves.toBeUndefined();
  });

  it('AC-1/AC-5: e-mail fora da lista recebe 403 com mensagem genérica', async () => {
    await expect(middleware(requestWithEmail('cliente@exemplo.com'))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('AC-1: conta sem e-mail também recebe 403', async () => {
    await expect(middleware(requestWithEmail(undefined))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lista vazia na configuração nega todos', async () => {
    const closed = buildPlatformAdminMiddleware(parsePlatformAdminEmails(undefined));
    await expect(closed(requestWithEmail('admin@mobbs.com.br'))).rejects.toMatchObject({ statusCode: 403 });
  });
});
