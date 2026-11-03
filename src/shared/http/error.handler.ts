import type { Request, Response } from 'restify';
import * as Sentry from '@sentry/node';

interface RestifyHandledError extends Error {
  name: string;
  code?: number;
  statusCode?: number;
  errors?: Record<string, { message: string }>;
  toJSON?: () => Record<string, unknown>;
}

function defineToJSON(err: RestifyHandledError, body: Record<string, unknown>): void {
  Object.defineProperty(err, 'toJSON', {
    value: () => ({ message: err.message, ...body }),
    enumerable: false,
  });
}

export const handleError = (
  _req: Request,
  _res: Response,
  err: RestifyHandledError,
  done: () => void,
) => {
  switch (err.name) {
    case 'MongoError':
    case 'MongoServerError':
      if (err.code === 11000) {
        err.statusCode = 409;
        defineToJSON(err, { message: 'Registro duplicado' });
      }
      break;
    case 'ValidationError':
      err.statusCode = 400;
      defineToJSON(err, {
        errors: Object.values(err.errors ?? {}).map((e) => e.message),
      });
      break;
    case 'CastError':
      err.statusCode = 400;
      defineToJSON(err, { message: 'ID inválido' });
      break;
    case 'BillingBlockedError':
      defineToJSON(err, { message: err.message, code: 'billing_blocked' });
      break;
    default:
      defineToJSON(err, { message: err.message });
  }
  // Só reporta erro inesperado (500 ou sem status definido) — erro de negócio/validação (4xx,
  // já tratado acima ou vindo pronto do restify-errors) é esperado, não é bug, viraria ruído.
  if (!err.statusCode || err.statusCode >= 500) {
    Sentry.captureException(err);
  }
  return done();
};
