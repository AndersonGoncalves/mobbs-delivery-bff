import * as admin from 'firebase-admin';
import type { Request } from 'restify';

import { firebaseAuthMiddleware } from './firebase-auth.middleware';

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  auth: jest.fn(),
}));

function buildRequest(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe('firebaseAuthMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AC-6: rejeita com 401 sem executar handler de negócio quando não há header Authorization', async () => {
    const req = buildRequest(undefined);

    await expect(firebaseAuthMiddleware(req)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('AC-6: rejeita com 401 quando o token é inválido', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue(new Error('invalid'));
    (admin.auth as unknown as jest.Mock).mockReturnValue({ verifyIdToken });
    const req = buildRequest('Bearer token-invalido');

    await expect(firebaseAuthMiddleware(req)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('AC-7: disponibiliza req.user (uid/email) quando o token é válido', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: 'uid-123', email: 'ana@example.com' });
    (admin.auth as unknown as jest.Mock).mockReturnValue({ verifyIdToken });
    const req = buildRequest('Bearer token-valido');

    await firebaseAuthMiddleware(req);

    expect(req.user).toEqual({ uid: 'uid-123', email: 'ana@example.com' });
  });
});
