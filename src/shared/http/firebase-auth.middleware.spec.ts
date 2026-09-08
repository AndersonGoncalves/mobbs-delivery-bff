import * as admin from 'firebase-admin';
import type { Next, Request, Response } from 'restify';

import { firebaseAuthMiddleware } from './firebase-auth.middleware';

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
}));

function buildRequest(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe('firebaseAuthMiddleware', () => {
  let next: jest.MockedFunction<Next>;

  beforeEach(() => {
    next = jest.fn() as unknown as jest.MockedFunction<Next>;
    jest.clearAllMocks();
  });

  it('AC-6: responde 401 sem executar handler de negócio quando não há header Authorization', async () => {
    const req = buildRequest(undefined);

    await firebaseAuthMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as { statusCode?: number };
    expect(error?.statusCode).toBe(401);
  });

  it('AC-6: responde 401 quando o token é inválido', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue(new Error('invalid'));
    (admin.auth as unknown as jest.Mock).mockReturnValue({ verifyIdToken });
    const req = buildRequest('Bearer token-invalido');

    await firebaseAuthMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as { statusCode?: number };
    expect(error?.statusCode).toBe(401);
  });

  it('AC-7: disponibiliza req.user (uid/email) quando o token é válido', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: 'uid-123', email: 'ana@example.com' });
    (admin.auth as unknown as jest.Mock).mockReturnValue({ verifyIdToken });
    const req = buildRequest('Bearer token-valido');

    await firebaseAuthMiddleware(req, {} as Response, next);

    expect(req.user).toEqual({ uid: 'uid-123', email: 'ana@example.com' });
    expect(next).toHaveBeenCalledWith();
  });
});
